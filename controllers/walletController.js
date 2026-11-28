const Wallet = require("../models/wallet");
const WalletTransaction = require("../models/walletTransaction");
const RechargeOrder = require("../models/rechargeOrder");
const { getClient, isConfigured, verifyPaymentSignature, verifyWebhookSignature } = require("../services/razorpay");

const MIN_RECHARGE = 10;
const MAX_RECHARGE = 100000;
// Fixed denominations offered by the AI Jyotishi recharge sheet.
const AI_JYOTISHI_PRESETS = [50, 100, 200, 500];
const ALLOWED_METHODS = ["upi", "card", "netbanking", "wallet", "all"];

const currency = () => (process.env.CURRENCY || "INR").toUpperCase();

// Builds Razorpay Checkout display config that surfaces the chosen method first.
// Razorpay Orders API has no method param — method preference lives in Checkout.
const buildCheckoutConfig = (method) => {
  if (method === "all") return undefined;
  const blocks = {
    upi: method === "upi"
      ? { name: "Pay via UPI", instruments: [{ method: "upi" }] }
      : { name: "UPI", instruments: [{ method: "upi" }] },
  };
  if (method === "card") blocks.card = { name: "Card", instruments: [{ method: "card" }] };
  if (method === "netbanking") blocks.netbanking = { name: "Netbanking", instruments: [{ method: "netbanking" }] };
  if (method === "wallet") blocks.wallet = { name: "Wallet", instruments: [{ method: "wallet" }] };
  return {
    display: {
      blocks,
      sequence: [`block.${method}`, ...Object.keys(blocks).filter((k) => k !== method).map((k) => `block.${k}`)],
      preferences: { show_default_blocks: true },
    },
  };
};

const getOrCreateWallet = async (userId) => {
  const existing = await Wallet.findOne({ user: userId });
  if (existing) return existing;
  try {
    return await Wallet.create({ user: userId, balance: 0 });
  } catch (error) {
    // Concurrent first-time requests race on the unique `user` index.
    if (error.code !== 11000) throw error;
    return Wallet.findOne({ user: userId });
  }
};

// Idempotent credit: same providerPaymentId never credits twice.
// The balance is incremented atomically, and a duplicate transaction insert
// is rolled back, so a concurrent verify + webhook cannot double-credit.
const creditWalletOnce = async ({ userId, amount, providerPaymentId, orderId, method }) => {
  const existing = await WalletTransaction.findOne({ providerPaymentId }).lean();
  if (existing) {
    const wallet = await getOrCreateWallet(userId);
    return { wallet, transaction: existing, duplicate: true };
  }

  const wallet = await Wallet.findOneAndUpdate(
    { user: userId },
    { $inc: { balance: amount } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  try {
    const transaction = await WalletTransaction.create({
      user: userId,
      type: "credit",
      amount,
      balanceAfter: wallet.balance,
      reason: "recharge",
      providerPaymentId,
      meta: { method, orderId, paymentId: providerPaymentId },
    });
    return { wallet, transaction, duplicate: false };
  } catch (error) {
    // Reverse the increment when the unique payment-id insert loses the race.
    await Wallet.updateOne({ user: userId }, { $inc: { balance: -amount } });
    if (error.code === 11000) {
      const alreadyCredited = await WalletTransaction.findOne({ providerPaymentId }).lean();
      const currentWallet = await getOrCreateWallet(userId);
      return { wallet: currentWallet, transaction: alreadyCredited, duplicate: true };
    }
    throw error;
  }
};

const getBalance = async (req, res, next) => {
  try {
    const wallet = await getOrCreateWallet(req.user._id);
    res.json({ success: true, data: { ...wallet.toObject(), razorpayConfigured: isConfigured() } });
  } catch (error) { next(error); }
};

// POST /api/wallet/recharge/order {amount} — creates backend-owned Razorpay order
const createRechargeOrder = async (req, res, next) => {
  try {
    const rawAmount = req.body.amount;
    let amount = Number(rawAmount);
    if (!amount || amount < MIN_RECHARGE || amount > MAX_RECHARGE) {
      return res.status(400).json({ success: false, message: `amount (${MIN_RECHARGE}-${MAX_RECHARGE}) is required` });
    }
    // Razorpay charges whole paise. Reject sub-paise amounts instead of
    // charging a rounded figure and crediting a different wallet balance.
    if (
      (typeof rawAmount === "string" && !/^\d+(?:\.\d{1,2})?$/.test(rawAmount.trim())) ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6
    ) {
      return res.status(400).json({ success: false, message: "amount must have at most two decimal places" });
    }
    amount = Math.round(amount * 100) / 100;
    if (req.body.aiJyotishi === true && !AI_JYOTISHI_PRESETS.includes(amount)) {
      return res.status(400).json({
        success: false,
        message: `AI Jyotishi recharge amount must be one of: ${AI_JYOTISHI_PRESETS.join(", ")}`,
      });
    }
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Online payments are not configured. Set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET or use dev mock recharge.",
      });
    }
    const amountPaise = Math.round(amount * 100);
    const method = String(req.body.method || "all").toLowerCase();
    if (!ALLOWED_METHODS.includes(method)) {
      return res.status(400).json({ success: false, message: `method must be one of: ${ALLOWED_METHODS.join(", ")}` });
    }
    const receipt = `rc_${req.user._id}_${Date.now()}`;
    const client = getClient();
    const order = await client.orders.create({ amount: amountPaise, currency: currency(), receipt });

    await RechargeOrder.create({
      user: req.user._id,
      amount,
      amountPaise,
      currency: currency(),
      razorpayOrderId: order.id,
      receipt,
      paymentMethod: method,
      status: "created",
    });

    res.status(201).json({
      success: true,
      message: "Order created",
      data: {
        orderId: order.id,
        amount,
        amountPaise,
        currency: currency(),
        method,
        keyId: process.env.RAZORPAY_KEY_ID,
        // Pass this straight into new Razorpay({...}).open() on the client.
        checkout: {
          key: process.env.RAZORPAY_KEY_ID,
          amount: amountPaise,
          currency: currency(),
          order_id: order.id,
          name: "Astro Wallet Recharge",
          prefill: { method },
          config: buildCheckoutConfig(method),
        },
      },
    });
  } catch (error) { next(error); }
};

// POST /api/wallet/recharge/verify {orderId, paymentId, signature}
const verifyRecharge = async (req, res, next) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ success: false, message: "orderId, paymentId and signature are required" });
    }
    const rechargeOrder = await RechargeOrder.findOne({ razorpayOrderId: orderId, user: req.user._id });
    if (!rechargeOrder) return res.status(404).json({ success: false, message: "Order not found" });
    if (rechargeOrder.status === "paid") {
      const wallet = await getOrCreateWallet(req.user._id);
      return res.json({ success: true, message: "Already credited", data: { wallet } });
    }
    if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
      rechargeOrder.status = "failed";
      await rechargeOrder.save();
      return res.status(400).json({ success: false, message: "Payment signature verification failed" });
    }

    // Confirm with Razorpay that payment is captured and amount matches the order.
    if (isConfigured()) {
      try {
        let payment = await getClient().payments.fetch(paymentId);
        if (payment.order_id !== orderId) {
          rechargeOrder.status = "failed";
          await rechargeOrder.save();
          return res.status(400).json({ success: false, message: "Payment does not belong to this order" });
        }
        // Some accounts don't auto-capture: capture the authorised payment first.
        if (payment.status === "authorized") {
          try {
            payment = await getClient().payments.capture(paymentId, rechargeOrder.amountPaise, currency());
          } catch (_) {
            // Fall through — the status check below will reject anything not captured.
          }
        }
        if (payment.status !== "captured" || Number(payment.amount) !== rechargeOrder.amountPaise) {
          rechargeOrder.status = "failed";
          await rechargeOrder.save();
          return res.status(400).json({ success: false, message: "Payment not captured or amount mismatch" });
        }
      } catch (fetchError) {
        return res.status(502).json({ success: false, message: "Could not confirm payment with Razorpay. Retry." });
      }
    }

    const { wallet, transaction, duplicate } = await creditWalletOnce({
      userId: req.user._id,
      amount: rechargeOrder.amount,
      providerPaymentId: paymentId,
      orderId,
      method: rechargeOrder.paymentMethod || "razorpay",
    });
    rechargeOrder.status = "paid";
    rechargeOrder.razorpayPaymentId = paymentId;
    rechargeOrder.verifiedAt = new Date();
    await rechargeOrder.save();

    res.json({
      success: true,
      message: duplicate ? "Already credited" : "Wallet recharged",
      data: { wallet, transaction },
    });
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate paymentId raced in — treat as already credited.
      const wallet = await getOrCreateWallet(req.user._id);
      return res.json({ success: true, message: "Already credited", data: { wallet } });
    }
    next(error);
  }
};

// POST /api/wallet/webhook — Razorpay server-to-server fallback (no auth; signature checked)
const rechargeWebhook = async (req, res, next) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    // HMAC is over the exact bytes Razorpay sent. A re-serialized JSON body is
    // not equivalent and would silently reject legitimate webhooks.
    if (!Buffer.isBuffer(req.rawBody) || req.rawBody.length === 0) {
      return res.status(400).json({ success: false, message: "Missing raw webhook body" });
    }
    const rawBody = req.rawBody;
    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ success: false, message: "Invalid webhook signature" });
    }
    const event = req.body?.event;
    const payment = req.body?.payload?.payment?.entity;
    if (event === "payment.captured" && payment?.id && payment?.order_id) {
      const rechargeOrder = await RechargeOrder.findOne({ razorpayOrderId: payment.order_id });
      if (rechargeOrder && rechargeOrder.status !== "paid" && Number(payment.amount) === rechargeOrder.amountPaise) {
        try {
          await creditWalletOnce({
            userId: rechargeOrder.user,
            amount: rechargeOrder.amount,
            providerPaymentId: payment.id,
            orderId: payment.order_id,
            method: rechargeOrder.paymentMethod || "razorpay_webhook",
          });
          rechargeOrder.status = "paid";
          rechargeOrder.razorpayPaymentId = payment.id;
          rechargeOrder.verifiedAt = new Date();
          await rechargeOrder.save();
        } catch (err) {
          if (err.code !== 11000) throw err;
        }
      }
    } else if (event === "payment.failed" && payment?.order_id) {
      await RechargeOrder.findOneAndUpdate({ razorpayOrderId: payment.order_id }, { status: "failed" });
    }
    res.json({ success: true });
  } catch (error) { next(error); }
};

// Legacy mock — dev only. Never enabled in production, even if an example
// env file happened to set ALLOW_MOCK_RECHARGE=true.
const recharge = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ success: false, message: "Mock recharge is disabled. Use /recharge/order + /recharge/verify." });
    }
    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    if (!amount || amount <= 0 || amount > MAX_RECHARGE) {
      return res.status(400).json({ success: false, message: `amount (1-${MAX_RECHARGE}) is required` });
    }
    const mockPaymentId = `mock_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    const { wallet, transaction } = await creditWalletOnce({
      userId: req.user._id,
      amount,
      providerPaymentId: req.body.paymentId || mockPaymentId,
      orderId: null,
      method: "mock",
    });
    res.json({ success: true, message: "Wallet recharged (mock)", data: { wallet, transaction } });
  } catch (error) { next(error); }
};

const rechargePresets = async (req, res, next) => {
  try {
    res.json({ success: true, data: { presets: AI_JYOTISHI_PRESETS, currency: currency() } });
  } catch (error) { next(error); }
};

const listTransactions = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const [items, total] = await Promise.all([
      WalletTransaction.find({ user: req.user._id })
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      WalletTransaction.countDocuments({ user: req.user._id }),
    ]);
    res.json({ success: true, data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
  } catch (error) { next(error); }
};

module.exports = { getBalance, recharge, createRechargeOrder, verifyRecharge, rechargeWebhook, listTransactions, rechargePresets, AI_JYOTISHI_PRESETS };
