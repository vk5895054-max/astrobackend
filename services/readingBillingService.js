// Free-tier + prepaid-wallet billing for Face Reading and Palm Reading.
//
// Flow (mirrors numerology billing):
//   1. A "basic" reading is free while the per-feature free quota lasts.
//   2. A "detailed" reading is always paid.
//   3. Once the free quota is over, the wallet is debited BEFORE the AI call.
//   4. If the AI call fails, the charge is refunded.
//
// All consumption/refund paths are atomic so two simultaneous requests can
// never spend the same free reading or overdraw the wallet.

const ReadingFreeUsage = require("../models/readingFreeUsage");
const Wallet = require("../models/wallet");
const WalletTransaction = require("../models/walletTransaction");

const DEFAULT_PRICES = {
  face: { basic: 20, detailed: 50 },
  palm: { basic: 20, detailed: 50 },
};

const clampInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const featureKey = (feature) => (feature === "palm" ? "palm" : "face");
const usedField = (feature) => (feature === "palm" ? "palmUsed" : "faceUsed");
const limitField = (feature) => (feature === "palm" ? "palmLimit" : "faceLimit");
const chargeReason = (feature) => `${featureKey(feature)}_reading_charge`;

const freeLimitDefault = () => clampInt(process.env.READING_FREE_LIMIT, 1);

const priceFor = (feature, tier) => {
  const key = featureKey(feature);
  const resolvedTier = tier === "detailed" ? "detailed" : "basic";
  const envKey = `${key.toUpperCase()}_READING_${resolvedTier.toUpperCase()}_PRICE`;
  return clampInt(process.env[envKey], DEFAULT_PRICES[key][resolvedTier]);
};

const getOrCreateWallet = (userId) =>
  Wallet.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { balance: 0 } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
  );

const getOrCreateUsage = (userId) => {
  const limit = freeLimitDefault();
  return ReadingFreeUsage.findOneAndUpdate(
    { user: userId },
    {
      $setOnInsert: {
        faceUsed: 0,
        palmUsed: 0,
        faceLimit: limit,
        palmLimit: limit,
      },
    },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
  );
};

const getStatus = async (userId, feature) => {
  const key = featureKey(feature);
  const [usage, wallet] = await Promise.all([
    getOrCreateUsage(userId),
    getOrCreateWallet(userId),
  ]);
  const limit = usage[limitField(key)] ?? freeLimitDefault();
  const used = usage[usedField(key)] || 0;
  const freeRemaining = Math.max(0, limit - used);
  return {
    feature: key,
    freeUsed: used,
    freeLimit: limit,
    freeRemaining,
    walletBalance: wallet.balance,
    basicPrice: priceFor(key, "basic"),
    detailedPrice: priceFor(key, "detailed"),
    canUseFree: freeRemaining > 0,
  };
};

const ensureBillable = async (userId, feature, tier, options = {}) => {
  const key = featureKey(feature);
  const resolvedTier = tier === "detailed" ? "detailed" : "basic";
  const price = options.price ?? priceFor(key, resolvedTier);
  const status = await getStatus(userId, key);

  if (resolvedTier === "basic" && status.freeRemaining > 0) {
    return {
      ok: true,
      isFree: true,
      price: 0,
      freeRemaining: status.freeRemaining,
      walletBalance: status.walletBalance,
    };
  }

  if (status.walletBalance >= price) {
    return {
      ok: true,
      isFree: false,
      price,
      freeRemaining: status.freeRemaining,
      walletBalance: status.walletBalance,
    };
  }

  return {
    ok: false,
    reason: "insufficient_balance",
    isFree: false,
    price,
    freeRemaining: status.freeRemaining,
    walletBalance: status.walletBalance,
  };
};

// Burn one free reading or debit the wallet. `gate` must come from
// ensureBillable(); both branches are guarded so races cannot overspend.
const consume = async (userId, feature, tier, gate) => {
  const key = featureKey(feature);
  if (gate.isFree) {
    const usage = await ReadingFreeUsage.findOneAndUpdate(
      {
        user: userId,
        $expr: { $lt: [`$${usedField(key)}`, `$${limitField(key)}`] },
      },
      { $inc: { [usedField(key)]: 1 } },
      { returnDocument: "after" }
    );
    if (!usage) {
      const error = new Error("INSUFFICIENT_BALANCE");
      error.code = "INSUFFICIENT_BALANCE";
      throw error;
    }
    return {
      isFree: true,
      charged: 0,
      price: 0,
      freeRemaining: Math.max(0, (usage[limitField(key)] || 0) - (usage[usedField(key)] || 0)),
      walletBalance: null,
    };
  }

  const price = gate.price ?? priceFor(key, tier);
  const wallet = await Wallet.findOneAndUpdate(
    { user: userId, balance: { $gte: price } },
    { $inc: { balance: -price } },
    { returnDocument: "after" }
  );
  if (!wallet) {
    const error = new Error("INSUFFICIENT_BALANCE");
    error.code = "INSUFFICIENT_BALANCE";
    throw error;
  }

  await WalletTransaction.create({
    user: userId,
    type: "debit",
    amount: price,
    balanceAfter: wallet.balance,
    reason: chargeReason(key),
    meta: { feature: key, tier, price },
  });

  return {
    isFree: false,
    charged: price,
    price,
    freeRemaining: 0,
    walletBalance: wallet.balance,
  };
};

const refund = async (userId, feature, consumption) => {
  if (!consumption) return null;
  const key = featureKey(feature);

  if (consumption.isFree) {
    const usage = await ReadingFreeUsage.findOneAndUpdate(
      { user: userId, [usedField(key)]: { $gt: 0 } },
      { $inc: { [usedField(key)]: -1 } },
      { returnDocument: "after" }
    );
    return {
      refunded: 0,
      isFree: true,
      freeRemaining: usage
        ? Math.max(0, (usage[limitField(key)] || 0) - (usage[usedField(key)] || 0))
        : 0,
    };
  }

  const amount = consumption.charged || 0;
  if (amount <= 0) return null;

  const wallet = await Wallet.findOneAndUpdate(
    { user: userId },
    { $inc: { balance: amount } },
    { returnDocument: "after" }
  );
  await WalletTransaction.create({
    user: userId,
    type: "credit",
    amount,
    balanceAfter: wallet?.balance ?? 0,
    reason: "refund",
    meta: { refundReason: `${key}_reading_failed`, originalAmount: amount },
  });
  return { refunded: amount, isFree: false, walletBalance: wallet?.balance ?? 0 };
};

// Admin helper: change the free allowance for one user/feature.
const setFreeLimit = async (userId, feature, limit) => {
  const key = featureKey(feature);
  const usage = await getOrCreateUsage(userId);
  usage[limitField(key)] = clampInt(limit, 0);
  await usage.save();
  return getStatus(userId, key);
};

module.exports = {
  priceFor,
  getStatus,
  ensureBillable,
  consume,
  refund,
  setFreeLimit,
};
