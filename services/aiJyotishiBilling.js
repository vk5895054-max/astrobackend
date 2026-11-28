// Server-owned billing for AI Jyotishi chats.
//
// One successful AI reply consumes one billed minute. Nothing is debited for
// failed replies, safety interruptions, or an idle/unstarted chat. The wallet
// decrement is atomic (`balance >= price`) so concurrent messages cannot
// overdraw, and every debit/refund writes a ledger row.
const Wallet = require("../models/wallet");
const WalletTransaction = require("../models/walletTransaction");

const getOrCreateWallet = async (userId, deps = {}) =>
  (deps.WalletModel || Wallet).findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { balance: 0 } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );

const statusForBalance = (balance, pricePerMin) => {
  const amount = Number(pricePerMin) || 0;
  const remaining = Number(balance) || 0;
  return {
    canStart: remaining >= amount,
    // Warn when less than one more full minute is left.
    lowBalance: remaining > 0 && remaining <= amount,
    minutesRemaining: amount > 0 ? Math.floor(remaining / amount) : 0,
  };
};

const preflight = async (userId, pricePerMin, deps = {}) => {
  const wallet = await getOrCreateWallet(userId, deps);
  return { ...statusForBalance(wallet.balance, pricePerMin), balance: wallet.balance };
};

// Debit one minute. Only call after the AI reply has been generated.
const chargeMinute = async ({ userId, pricePerMin, sessionId, chargeKey, deps = {} }) => {
  const amount = Number(pricePerMin);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid pricePerMin");
  const WalletModel = deps.WalletModel || Wallet;
  const TxnModel = deps.TxnModel || WalletTransaction;

  const wallet = await WalletModel.findOneAndUpdate(
    { user: userId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { returnDocument: "after" },
  );
  if (!wallet) {
    const current = await getOrCreateWallet(userId, deps);
    const error = new Error("INSUFFICIENT_BALANCE");
    error.code = "INSUFFICIENT_BALANCE";
    error.statusCode = 402;
    error.expose = true;
    error.walletBalance = current.balance;
    throw error;
  }

  await TxnModel.create({
    user: userId,
    type: "debit",
    amount,
    balanceAfter: wallet.balance,
    reason: "ai_jyotishi_charge",
    meta: { session: sessionId, chargeKey, pricePerMin: amount },
  });

  return {
    charged: amount,
    balance: wallet.balance,
    ...statusForBalance(wallet.balance, amount),
  };
};

// Give back a minute when a reply was generated but could not be persisted.
// Idempotent: the same chargeKey is never refunded twice.
const refundMinute = async ({ userId, amount, sessionId, chargeKey, deps = {} }) => {
  if (!chargeKey) return null;
  const WalletModel = deps.WalletModel || Wallet;
  const TxnModel = deps.TxnModel || WalletTransaction;
  const already = await TxnModel.findOne({
    reason: "ai_jyotishi_refund",
    "meta.chargeKey": chargeKey,
  }).lean();
  if (already) return { duplicate: true, amount: already.amount };

  const wallet = await WalletModel.findOneAndUpdate(
    { user: userId },
    { $inc: { balance: amount } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );
  await TxnModel.create({
    user: userId,
    type: "credit",
    amount,
    balanceAfter: wallet.balance,
    reason: "ai_jyotishi_refund",
    meta: { session: sessionId, chargeKey },
  });
  return { duplicate: false, amount, balance: wallet.balance };
};

module.exports = {
  getOrCreateWallet,
  statusForBalance,
  preflight,
  chargeMinute,
  refundMinute,
};
