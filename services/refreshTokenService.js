const crypto = require("crypto");
const User = require("../models/user");

// Refresh tokens are long-lived, random, single-use credentials. Only their
// SHA-256 hash is stored, so a database read cannot be replayed as a session.
// A rolling list allows one session per device without logging the others out
// when a user signs in on a second phone.
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 5;

const generate = () => crypto.randomBytes(48).toString("base64url");
const hash = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const issueFor = async (user) => {
  const raw = generate();
  const tokens = Array.isArray(user.refreshTokens) ? [...user.refreshTokens] : [];
  tokens.push({
    hash: hash(raw),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  user.refreshTokens = tokens.slice(-MAX_SESSIONS);
  await user.save({ validateBeforeSave: false });
  return raw;
};

const rotate = async (raw) => {
  if (typeof raw !== "string" || !raw) return null;
  const hashed = hash(raw);
  const user = await User.findOne({ "refreshTokens.hash": hashed }).select(
    "+refreshTokens"
  );
  if (!user || !user.isActive) return null;

  const entry = (user.refreshTokens || []).find(
    (item) => item && item.hash === hashed
  );
  if (!entry || !entry.expiresAt || entry.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const next = generate();
  entry.hash = hash(next);
  entry.expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await user.save({ validateBeforeSave: false });
  return { user, refreshToken: next };
};

const revoke = async (raw) => {
  if (typeof raw !== "string" || !raw) return;
  const hashed = hash(raw);
  const user = await User.findOne({ "refreshTokens.hash": hashed }).select(
    "+refreshTokens"
  );
  if (!user) return;
  user.refreshTokens = (user.refreshTokens || []).filter(
    (item) => item && item.hash !== hashed
  );
  await user.save({ validateBeforeSave: false });
};

module.exports = { generate, hash, issueFor, rotate, revoke, REFRESH_TTL_MS };
