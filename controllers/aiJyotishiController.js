const mongoose = require("mongoose");
const AiJyotishi = require("../models/aiJyotishi");
const AiJyotishiSession = require("../models/aiJyotishiSession");
const AiJyotishiMessage = require("../models/aiJyotishiMessage");
const AiJyotishiReview = require("../models/aiJyotishiReview");
const billing = require("../services/aiJyotishiBilling");
const { calculateFullKundli } = require("../services/kundliCalculationService");
const {
  buildSystemPrompt,
  buildKundliContext,
  detectSafetyCrisis,
  SUPPORT_MESSAGE,
} = require("../services/aiJyotishiPrompt");
const { generateReply } = require("../services/aiJyotishiLlm");

const httpError = (status, message) => {
  const error = new Error(message);
  error.statusCode = status;
  error.expose = true;
  return error;
};

// Serialize messages per session so two quick sends cannot both charge the
// same minute or interleave replies.
const sessionLocks = new Map();
const withSessionLock = (key, task) => {
  const previous = sessionLocks.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  sessionLocks.set(key, next);
  next
    .catch(() => {})
    .finally(() => {
      if (sessionLocks.get(key) === next) sessionLocks.delete(key);
    });
  return next;
};

const publicProfile = (doc) => {
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return {
    id: String(obj._id),
    slug: obj.slug,
    name: obj.name,
    photo: obj.photo,
    age: obj.age,
    gender: obj.gender,
    expertise: obj.expertise || [],
    categories: obj.categories || [],
    languages: obj.languages || [],
    pricePerMin: obj.pricePerMin,
    intro: obj.intro,
    style: obj.style,
    isActive: obj.isActive,
    // Ratings come only from verified user reviews. No reviews => "New".
    isNew: (obj.reviewCount || 0) === 0,
    ratingAvg: obj.reviewCount ? Number(obj.ratingAvg.toFixed(1)) : null,
    reviewCount: obj.reviewCount || 0,
  };
};

const list = async (req, res, next) => {
  try {
    const filter = { isActive: true };
    const category = String(req.query.category || "").trim();
    if (category && category.toLowerCase() !== "all") {
      filter.categories = { $in: [category] };
    }
    const search = String(req.query.search || "").trim().slice(0, 80);
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { expertise: { $regex: escaped, $options: "i" } },
      ];
    }
    const items = await AiJyotishi.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: items.map(publicProfile) });
  } catch (error) { next(error); }
};

const detail = async (req, res, next) => {
  try {
    const doc = await AiJyotishi.findOne({ _id: req.params.id, isActive: true }).lean();
    if (!doc) throw httpError(404, "AI Jyotishi not found");
    res.json({ success: true, data: publicProfile(doc) });
  } catch (error) { next(error); }
};

const compactKundli = (calculated) => {
  const planets = {};
  for (const [name, value] of Object.entries(calculated.rawChart?.planets || {})) {
    if (value && value.rashi) {
      planets[name] = {
        rashi: value.rashi,
        degreeInSign: Number.isFinite(value.degreeInSign)
          ? Math.round(value.degreeInSign * 100) / 100
          : null,
        retrograde: Boolean(value.retrograde),
      };
    }
  }
  return { summary: calculated.summary || {}, planets };
};

const startSession = async (req, res, next) => {
  try {
    const body = req.body || {};
    const jyotishi = await AiJyotishi.findOne({ _id: body.jyotishiId, isActive: true }).lean();
    if (!jyotishi) throw httpError(404, "AI Jyotishi not found");

    const name = String(body.name || "").trim().slice(0, 120);
    const dateOfBirth = String(body.dateOfBirth || "").trim();
    const timeOfBirth = String(body.timeOfBirth || "").trim();
    const place = String(body.place || "").trim().slice(0, 160);
    if (!name || !dateOfBirth || !place) {
      throw httpError(422, "name, dateOfBirth and place are required");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(Date.parse(dateOfBirth))) {
      throw httpError(422, "dateOfBirth must be YYYY-MM-DD");
    }
    if (timeOfBirth && !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeOfBirth)) {
      throw httpError(422, "timeOfBirth must be HH:mm (24 hour)");
    }
    const latitude = body.latitude === undefined ? undefined : Number(body.latitude);
    const longitude = body.longitude === undefined ? undefined : Number(body.longitude);
    if (
      (latitude !== undefined && !Number.isFinite(latitude)) ||
      (longitude !== undefined && !Number.isFinite(longitude))
    ) {
      throw httpError(422, "latitude and longitude must be numbers");
    }

    // The ephemeris is the only source of grah-sthiti. No client-supplied
    // chart data is accepted, and missing time stays missing in the result.
    const calculated = await calculateFullKundli({
      name,
      dateOfBirth,
      timeOfBirth,
      place,
      latitude,
      longitude,
      timeZoneOffsetMinutes: Number(body.timeZoneOffsetMinutes) || 330,
      timeProvided: Boolean(timeOfBirth),
      locationProvided: latitude !== undefined && longitude !== undefined,
      save: false,
    });
    const kundli = compactKundli(calculated);

    const preflight = await billing.preflight(req.user._id, jyotishi.pricePerMin);
    if (!preflight.canStart) {
      throw httpError(402, "Please recharge your wallet before starting the chat");
    }

    const session = await AiJyotishiSession.create({
      user: req.user._id,
      jyotishi: jyotishi._id,
      birthDetails: {
        name,
        dateOfBirth,
        timeOfBirth,
        place,
        latitude,
        longitude,
        timeZoneOffsetMinutes: Number(body.timeZoneOffsetMinutes) || 330,
      },
      kundli,
      locale: String(body.locale || req.headers["accept-language"] || "hi-IN").split(",")[0],
      pricePerMin: jyotishi.pricePerMin,
    });

    await AiJyotishi.updateOne({ _id: jyotishi._id }, { $inc: { totalChats: 1 } });

    res.status(201).json({
      success: true,
      data: {
        session,
        jyotishi: publicProfile(jyotishi),
        kundli: kundli.summary,
        pricing: {
          pricePerMin: jyotishi.pricePerMin,
          balance: preflight.balance,
          minutesRemaining: preflight.minutesRemaining,
          lowBalance: preflight.lowBalance,
        },
      },
    });
  } catch (error) { next(error); }
};

const loadOwnedSession = async (sessionId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) throw httpError(400, "Invalid session id");
  const session = await AiJyotishiSession.findOne({ _id: sessionId, user: userId });
  if (!session) throw httpError(404, "Chat session not found");
  return session;
};

const sessionHistory = async (sessionId) => {
  const messages = await AiJyotishiMessage.find({
    session: sessionId,
    role: { $in: ["user", "assistant"] },
  })
    .sort({ createdAt: 1 })
    .limit(24)
    .lean();
  return messages.map((message) => ({ role: message.role, content: message.text }));
};

const getSession = async (req, res, next) => {
  try {
    const session = await loadOwnedSession(req.params.sessionId, req.user._id);
    const jyotishi = await AiJyotishi.findById(session.jyotishi).lean();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const [messages, total] = await Promise.all([
      AiJyotishiMessage.find({ session: session._id })
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AiJyotishiMessage.countDocuments({ session: session._id }),
    ]);
    const wallet = await billing.getOrCreateWallet(req.user._id);
    res.json({
      success: true,
      data: {
        session,
        jyotishi: jyotishi ? publicProfile(jyotishi) : null,
        messages,
        pricing: {
          pricePerMin: session.pricePerMin,
          balance: wallet.balance,
          ...billing.statusForBalance(wallet.balance, session.pricePerMin),
        },
        pagination: { page, limit, total },
      },
    });
  } catch (error) { next(error); }
};

const endSession = async (req, res, next) => {
  try {
    const session = await loadOwnedSession(req.params.sessionId, req.user._id);
    if (session.status === "active") {
      session.status = "ended";
      session.endReason = "user_ended";
      session.endedAt = new Date();
      await session.save();
    }
    res.json({ success: true, data: session });
  } catch (error) { next(error); }
};

const sendMessage = async (req, res, next) => {
  const sessionId = req.params.sessionId;
  try {
    const result = await withSessionLock(String(sessionId), async () => {
      const session = await loadOwnedSession(sessionId, req.user._id);
      const text = String(req.body?.text || "").trim().slice(0, 4000);
      if (!text) throw httpError(422, "text is required");

      if (session.status !== "active") {
        throw httpError(409, "This chat is closed");
      }

      // Crisis handling comes first: no chart, no model call, no billing.
      if (detectSafetyCrisis(text)) {
        await AiJyotishiMessage.create([
          { session: session._id, user: req.user._id, role: "user", text },
          {
            session: session._id,
            user: req.user._id,
            role: "assistant",
            text: SUPPORT_MESSAGE,
            kind: "safety_support",
          },
        ]);
        session.status = "safety_stopped";
        session.endReason = "self_harm_support";
        session.endedAt = new Date();
        await session.save();
        return {
          reply: SUPPORT_MESSAGE,
          billing: {
            charged: 0,
            balance: (await billing.getOrCreateWallet(req.user._id)).balance,
            pricePerMin: session.pricePerMin,
            lowBalance: false,
            minutesRemaining: 0,
          },
          sessionEnded: true,
          billingStopped: true,
          safetySupport: true,
        };
      }

      const preflight = await billing.preflight(req.user._id, session.pricePerMin);
      if (!preflight.canStart) {
        session.status = "exhausted";
        session.endReason = "balance_exhausted";
        session.endedAt = new Date();
        await session.save();
        throw httpError(402, "Wallet balance finished. Please recharge to continue.");
      }

      const jyotishi = await AiJyotishi.findById(session.jyotishi).lean();
      if (!jyotishi || !jyotishi.isActive) {
        throw httpError(409, "This AI Jyotishi is no longer available");
      }
      const history = await sessionHistory(session._id);
      const reply = await generateReply({
        systemPrompt: buildSystemPrompt(jyotishi),
        kundliContext: buildKundliContext(session.kundli),
        locale: session.locale || req.headers["accept-language"] || "hi-IN",
        history: [...history, { role: "user", content: text }],
      });

      // Charge only after a real reply exists. A failed provider call costs
      // nothing and leaves the session open for a retry.
      const chargeKey = `${session._id}:${session.billedMinutes + 1}`;
      const charge = await billing.chargeMinute({
        userId: req.user._id,
        pricePerMin: session.pricePerMin,
        sessionId: session._id,
        chargeKey,
      });

      try {
        await AiJyotishiMessage.create([
          { session: session._id, user: req.user._id, role: "user", text },
          { session: session._id, user: req.user._id, role: "assistant", text: reply },
        ]);
        session.billedMinutes += 1;
        session.billedAmount += charge.charged;
        session.lastMessageAt = new Date();
        if (charge.lowBalance && !session.warningSentAt) session.warningSentAt = new Date();
        await session.save();
      } catch (persistError) {
        await billing
          .refundMinute({
            userId: req.user._id,
            amount: charge.charged,
            sessionId: session._id,
            chargeKey,
          })
          .catch((refundError) => console.error("[ai-jyotishi] refund failed:", refundError));
        throw persistError;
      }

      return {
        reply,
        billing: {
          charged: charge.charged,
          balance: charge.balance,
          pricePerMin: session.pricePerMin,
          lowBalance: charge.lowBalance,
          minutesRemaining: charge.minutesRemaining,
        },
        sessionEnded: false,
        billingStopped: false,
      };
    });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

const addReview = async (req, res, next) => {
  try {
    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw httpError(422, "rating must be an integer between 1 and 5");
    }
    const jyotishi = await AiJyotishi.findOne({ _id: req.params.id, isActive: true });
    if (!jyotishi) throw httpError(404, "AI Jyotishi not found");
    // Only a real user who actually chatted may leave a rating.
    const session = await AiJyotishiSession.findOne({
      user: req.user._id,
      jyotishi: jyotishi._id,
    });
    if (!session) throw httpError(403, "Chat with this AI Jyotishi first to leave a review");

    const comment = String(req.body?.comment || "").trim().slice(0, 1000);
    await AiJyotishiReview.findOneAndUpdate(
      { user: req.user._id, jyotishi: jyotishi._id },
      { $set: { rating, comment, session: session._id } },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );
    const aggregate = await AiJyotishiReview.aggregate([
      { $match: { jyotishi: jyotishi._id } },
      { $group: { _id: "$jyotishi", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    jyotishi.ratingAvg = aggregate[0] ? Number(aggregate[0].avg.toFixed(2)) : 0;
    jyotishi.reviewCount = aggregate[0]?.count || 0;
    await jyotishi.save();
    res.json({ success: true, data: publicProfile(jyotishi) });
  } catch (error) { next(error); }
};

const listReviews = async (req, res, next) => {
  try {
    const reviews = await AiJyotishiReview.find({ jyotishi: req.params.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("rating comment createdAt")
      .lean();
    res.json({ success: true, data: reviews });
  } catch (error) { next(error); }
};

module.exports = {
  list,
  detail,
  startSession,
  getSession,
  endSession,
  sendMessage,
  addReview,
  listReviews,
  publicProfile,
};
