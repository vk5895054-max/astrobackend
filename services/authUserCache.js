// Small in-process cache for the user document loaded by the auth middleware.
//
// Every authenticated request used to pay a `User.findById` round-trip before
// the controller even ran. On a hosted MongoDB that is 20-40ms per request and
// it is repeated for every single API call. A short TTL removes that cost for
// repeat traffic while keeping deactivation/role changes effective almost
// immediately. The TTL is deliberately tiny (15s by default) so a deactivated
// account cannot keep using the API for long, and callers that change a user's
// auth state invalidate the entry explicitly.
//
// Set AUTH_USER_CACHE_MS=0 to disable the cache entirely.

const User = require("../models/user");

const DEFAULT_TTL_MS = 15_000;
const MAX_ENTRIES = 5_000;

const ttlMs = (() => {
  const raw = Number(process.env.AUTH_USER_CACHE_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_TTL_MS;
})();

const cache = new Map();

const getCachedUser = async (userId) => {
  if (!ttlMs || !userId) return User.findById(userId);

  const key = String(userId);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.user;

  const user = await User.findById(userId);

  // Only active users are cached: an inactive account must be able to log
  // back in the moment an admin reactivates it.
  if (user && user.isActive) {
    if (cache.size >= MAX_ENTRIES) {
      // Map keeps insertion order — drop the oldest entry first.
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
    cache.set(key, { user, expiresAt: now + ttlMs });
  } else {
    cache.delete(key);
  }

  return user;
};

const invalidateAuthUser = (userId) => {
  if (userId) cache.delete(String(userId));
  else cache.clear();
};

module.exports = { getCachedUser, invalidateAuthUser, AUTH_USER_CACHE_TTL_MS: ttlMs };
