const moment = require("moment-timezone");

const placeCache = new Map();
const tzCache = new Map();
const MAX_CACHE = 2000;

function setCache(map, key, val) {
  if (map.size >= MAX_CACHE) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, val);
}

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: { "User-Agent": "backend-astrology-service" },
  });

  if (!response.ok) {
    throw new Error(`Geocoding request failed with status ${response.status}`);
  }

  return response.json();
};

const lookupPlace = async (placeOfBirth) => {
  const trimmed = String(placeOfBirth || "").trim();
  if (!trimmed) return null;
  const cacheKey = trimmed.toLowerCase();
  if (placeCache.has(cacheKey)) {
    return placeCache.get(cacheKey);
  }

  const query = encodeURIComponent(trimmed);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${query}`;
  const rows = await fetchJson(url);
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const row = rows[0];
  const latitude = Number.parseFloat(row.lat);
  const longitude = Number.parseFloat(row.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const result = {
    latitude,
    longitude,
    placeOfBirth: row.display_name || row.name || placeOfBirth,
  };
  setCache(placeCache, cacheKey, result);
  return result;
};

// Resolves the timezone for a coordinate pair, preferring the HISTORICAL
// UTC offset that was in effect at the birth moment over the CURRENT offset.
// Open-Meteo reports the IANA timezone name (necessary for DST history) plus
// today's utc_offset_seconds. moment-timezone then converts the birth
// moment's offset using its full IANA (default) timezone database.
const resolveTimeZoneInfo = async ({ latitude, longitude, birthDate }) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const birthDateStr = birthDate ? (birthDate instanceof Date ? birthDate.toISOString().slice(0, 10) : String(birthDate).slice(0, 10)) : "";
  const tzKey = `${Number(latitude).toFixed(3)},${Number(longitude).toFixed(3)},${birthDateStr}`;
  if (tzCache.has(tzKey)) {
    return tzCache.get(tzKey);
  }

  let weather;
  try {
    const timezoneUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`;
    weather = await fetchJson(timezoneUrl);
  } catch (error) {
    return null;
  }
  if (!weather || !Number.isFinite(weather.utc_offset_seconds)) return null;

  const currentOffsetMinutes = Math.round(weather.utc_offset_seconds / 60);
  const timeZoneId = typeof weather.timezone === "string" ? weather.timezone : null;

  const birthInstant = birthDate instanceof Date ? birthDate : new Date(birthDate);
  const hasUsableZone = timeZoneId && moment.tz.zone(timeZoneId);
  const birthYear = Number.isNaN(birthInstant.getTime()) ? NaN : birthInstant.getUTCFullYear();
  const canResolveHistorical =
    hasUsableZone &&
    Number.isFinite(birthYear) &&
    birthYear >= 1900 &&
    birthYear <= 2038; // moment-timezone's IANA historical data is reliable in this range.

  let result;
  if (canResolveHistorical) {
    const year = birthInstant.getUTCFullYear();
    const month = String(birthInstant.getUTCMonth() + 1).padStart(2, "0");
    const day = String(birthInstant.getUTCDate()).padStart(2, "0");
    const noonLocal = `${year}-${month}-${day}T12:00:00`;
    const historicalOffset = moment.tz(noonLocal, timeZoneId).utcOffset();
    if (Number.isFinite(historicalOffset)) {
      result = { timeZoneOffsetMinutes: historicalOffset, timeZoneId, timeZonePrecision: "historical" };
      setCache(tzCache, tzKey, result);
      return result;
    }
  }

  result = {
    timeZoneOffsetMinutes: currentOffsetMinutes,
    timeZoneId: timeZoneId || null,
    timeZonePrecision: "current-estimate",
  };
  setCache(tzCache, tzKey, result);
  return result;
};

// Resolves a place string into { latitude, longitude, placeOfBirth,
// timeZoneOffsetMinutes, timeZoneId, timeZonePrecision }.
// Returns null when the place (or its timezone) cannot be resolved — callers
// must treat null as a hard failure rather than silently assume UTC.
const resolveBirthLocationFromPlace = async (placeOfBirth, birthDate, providedCoords = null) => {
  let resolvedPlace = null;
  if (
    providedCoords &&
    Number.isFinite(Number(providedCoords.latitude)) &&
    Number.isFinite(Number(providedCoords.longitude))
  ) {
    resolvedPlace = {
      latitude: Number(providedCoords.latitude),
      longitude: Number(providedCoords.longitude),
      placeOfBirth: placeOfBirth || "",
    };
  } else {
    resolvedPlace = await lookupPlace(placeOfBirth);
  }
  if (!resolvedPlace) return null;

  const timeZoneInfo = await resolveTimeZoneInfo({ ...resolvedPlace, birthDate });
  if (!timeZoneInfo) return null;

  return {
    ...resolvedPlace,
    ...timeZoneInfo,
  };
};

module.exports = {
  lookupPlace,
  resolveTimeZoneInfo,
  resolveBirthLocationFromPlace,
};