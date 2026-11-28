const AiJyotishi = require("../models/aiJyotishi");
const AiJyotishiSession = require("../models/aiJyotishiSession");
const AiJyotishiMessage = require("../models/aiJyotishiMessage");
const AiJyotishiReview = require("../models/aiJyotishiReview");
const User = require("../models/user");
const Wallet = require("../models/wallet");
const WalletTransaction = require("../models/walletTransaction");
const RechargeOrder = require("../models/rechargeOrder");
const { buildSystemPrompt } = require("../services/aiJyotishiPrompt");

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 422;
  error.expose = true;
  return error;
};

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const stringList = (value, field) => {
  if (!Array.isArray(value)) throw badRequest(`${field} must be an array`);
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim().slice(0, 80))
    .slice(0, 30);
};

const boundedNumber = (value, min, max, field) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw badRequest(`${field} must be a number`);
  return Math.min(Math.max(parsed, min), max);
};

const applyFields = (doc, body, { creating }) => {
  const strings = ["name", "photo", "intro", "style", "systemPrompt"];
  for (const key of strings) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && typeof body[key] !== "string") throw badRequest(`${key} must be a string`);
    doc[key] = body[key] === null ? "" : String(body[key]).trim().slice(0, key === "systemPrompt" ? 8000 : 2000);
  }
  if (creating && !doc.name) throw badRequest("name is required");
  if (body.age !== undefined) doc.age = boundedNumber(body.age, 18, 120, "age");
  if (creating && !Number.isFinite(doc.age)) throw badRequest("age is required");
  if (body.gender !== undefined) {
    if (!["male", "female", "other"].includes(body.gender)) throw badRequest("invalid gender");
    doc.gender = body.gender;
  }
  if (body.pricePerMin !== undefined) {
    doc.pricePerMin = boundedNumber(body.pricePerMin, 1, 10000, "pricePerMin");
  }
  if (creating && !Number.isFinite(doc.pricePerMin)) throw badRequest("pricePerMin is required");
  for (const key of ["expertise", "categories", "languages"]) {
    if (body[key] !== undefined) doc[key] = stringList(body[key], key);
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") throw badRequest("isActive must be a boolean");
    doc.isActive = body.isActive;
  }
  // buildSystemPrompt() always starts from the mandatory template, so an admin
  // can add style notes but can never delete the safety contract.
  const safePrompt = buildSystemPrompt({
    name: doc.name || "AI Jyotishi",
    expertise: doc.expertise || [],
    style: doc.style || "shaant aur apnepan wala",
  });
  doc.systemPrompt = body.systemPrompt
    ? `${String(body.systemPrompt).trim().slice(0, 4000)}\n\n--- safety contract ---\n${safePrompt}`
    : safePrompt;
};

const list = async (req, res, next) => {
  try {
    const items = await AiJyotishi.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: items });
  } catch (error) { next(error); }
};

const getOne = async (req, res, next) => {
  try {
    const doc = await AiJyotishi.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "AI Jyotishi not found" });
    res.json({ success: true, data: doc });
  } catch (error) { next(error); }
};

const create = async (req, res, next) => {
  try {
    const body = req.body || {};
    const doc = new AiJyotishi({
      slug: slugify(body.slug || body.name || `ai-${Date.now()}`),
      ratingAvg: 0,
      reviewCount: 0,
      totalChats: 0,
    });
    applyFields(doc, body, { creating: true });
    await doc.save();
    res.status(201).json({ success: true, message: "AI Jyotishi created", data: doc });
  } catch (error) { next(error); }
};

const update = async (req, res, next) => {
  try {
    const doc = await AiJyotishi.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "AI Jyotishi not found" });
    applyFields(doc, req.body || {}, { creating: false });
    // Ratings are aggregates of real reviews and are deliberately not editable.
    await doc.save();
    res.json({ success: true, message: "AI Jyotishi updated", data: doc });
  } catch (error) { next(error); }
};

const toggle = async (req, res, next) => {
  try {
    const doc = await AiJyotishi.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "AI Jyotishi not found" });
    doc.isActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : !doc.isActive;
    await doc.save();
    res.json({ success: true, message: doc.isActive ? "AI Jyotishi enabled" : "AI Jyotishi disabled", data: doc });
  } catch (error) { next(error); }
};

const remove = async (req, res, next) => {
  try {
    const doc = await AiJyotishi.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "AI Jyotishi not found" });
    const sessions = await AiJyotishiSession.find({ jyotishi: doc._id }).select("_id").lean();
    const sessionIds = sessions.map((session) => session._id);
    await Promise.all([
      AiJyotishiMessage.deleteMany({ session: { $in: sessionIds } }),
      AiJyotishiReview.deleteMany({ jyotishi: doc._id }),
      AiJyotishiSession.deleteMany({ jyotishi: doc._id }),
    ]);
    await doc.deleteOne();
    res.json({ success: true, message: "AI Jyotishi deleted" });
  } catch (error) { next(error); }
};

// Paginated chat history. Messages stay attached to their session so an admin
// can read a conversation without stitching two unrelated lists together.
const listSessions = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const filter = {};
    if (req.query.userId) filter.user = req.query.userId;
    if (req.query.jyotishiId) filter.jyotishi = req.query.jyotishiId;
    if (req.query.status) filter.status = String(req.query.status);
    const [sessions, total] = await Promise.all([
      AiJyotishiSession.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AiJyotishiSession.countDocuments(filter),
    ]);
    const messages = await AiJyotishiMessage.find({
      session: { $in: sessions.map((session) => session._id) },
    })
      .sort({ createdAt: 1 })
      .lean();
    const bySession = new Map();
    for (const message of messages) {
      const key = String(message.session);
      if (!bySession.has(key)) bySession.set(key, []);
      bySession.get(key).push(message);
    }
    res.json({
      success: true,
      data: {
        sessions: sessions.map((session) => ({
          ...session,
          messages: bySession.get(String(session._id)) || [],
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Users / wallet / payments / chat / earnings — the admin panel reads this one
// aggregate instead of guessing across collections.
const overview = async (req, res, next) => {
  try {
    const [jyotishis, activeJyotishis, sessions, activeSessions, reviews, walletTransactions, rechargeOrders, users] =
      await Promise.all([
        AiJyotishi.countDocuments({}),
        AiJyotishi.countDocuments({ isActive: true }),
        AiJyotishiSession.countDocuments({}),
        AiJyotishiSession.countDocuments({ status: "active" }),
        AiJyotishiReview.countDocuments({}),
        WalletTransaction.find({ reason: { $in: ["ai_jyotishi_charge", "ai_jyotishi_refund"] } }).lean(),
        RechargeOrder.find({ status: "paid" }).select("amount user createdAt").lean(),
        User.countDocuments({}),
      ]);
    const charged = walletTransactions
      .filter((txn) => txn.reason === "ai_jyotishi_charge")
      .reduce((sum, txn) => sum + Number(txn.amount || 0), 0);
    const refunded = walletTransactions
      .filter((txn) => txn.reason === "ai_jyotishi_refund")
      .reduce((sum, txn) => sum + Number(txn.amount || 0), 0);
    const recharged = rechargeOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
    const wallets = await Wallet.aggregate([
      { $group: { _id: null, balance: { $sum: "$balance" }, users: { $sum: 1 } } },
    ]);
    res.json({
      success: true,
      data: {
        jyotishis: { total: jyotishis, active: activeJyotishis },
        users: { total: users, withWallet: wallets[0]?.users || 0 },
        chats: { total: sessions, active: activeSessions, reviews },
        payments: { recharged, orders: rechargeOrders.length },
        earnings: { charged, refunded, net: charged - refunded, walletOutstanding: wallets[0]?.balance || 0 },
      },
    });
  } catch (error) { next(error); }
};

// Admin/user-initiated refund of one AI charge. Idempotent by transaction id.
const refundCharge = async (req, res, next) => {
  try {
    const transactionId = req.body?.transactionId || req.params.transactionId;
    const reason = String(req.body?.reason || "refund").trim().slice(0, 200);
    if (!transactionId) throw badRequest("transactionId is required");
    const charge = await WalletTransaction.findOne({
      _id: transactionId,
      reason: "ai_jyotishi_charge",
    });
    if (!charge) return res.status(404).json({ success: false, message: "AI charge not found" });
    const key = `admin-refund:${charge._id}`;
    const already = await WalletTransaction.findOne({
      reason: "ai_jyotishi_refund",
      "meta.chargeKey": key,
    }).lean();
    if (already) {
      return res.json({ success: true, message: "Already refunded", data: { transaction: already } });
    }
    const wallet = await Wallet.findOneAndUpdate(
      { user: charge.user },
      { $inc: { balance: charge.amount } },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );
    const refund = await WalletTransaction.create({
      user: charge.user,
      type: "credit",
      amount: charge.amount,
      balanceAfter: wallet.balance,
      reason: "ai_jyotishi_refund",
      meta: { chargeKey: key, session: charge.meta?.session, reason },
    });
    await AiJyotishiSession.updateOne(
      { _id: charge.meta?.session },
      { $inc: { refundedAmount: charge.amount } },
    );
    res.json({ success: true, message: "Refunded", data: { transaction: refund } });
  } catch (error) { next(error); }
};

module.exports = { list, getOne, create, update, toggle, remove, listSessions, overview, refundCharge };
