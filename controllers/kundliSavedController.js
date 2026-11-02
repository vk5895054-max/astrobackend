const crypto = require("crypto");
const Horoscope = require("../models/horoscope");
const SavedKundli = require("../models/savedKundli");
const SavedKundliMatch = require("../models/savedKundliMatch");
const { calculateFullKundli, parseNormalizedTime } = require("../services/kundliCalculationService");

const numberOr = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const savedKundliItem = (item) => ({
  id: String(item._id),
  name: item.name || "Kundli",
  dateOfBirth: item.dateOfBirth,
  timeOfBirth: item.timeOfBirth,
  place: item.place,
  gender: item.gender || "Male",
  latitude: item.latitude,
  longitude: item.longitude,
  timeZoneOffsetMinutes: item.timeZoneOffsetMinutes,
  savedAt: item.createdAt || item.updatedAt,
  isProfile: false,
});

const profileKundliItem = (horoscope, user) => ({
  id: "profile",
  name: horoscope.name || user.name || "My Kundli",
  dateOfBirth: horoscope.dateOfBirth,
  timeOfBirth: horoscope.timeOfBirth || "12:00",
  place: horoscope.placeOfBirth || "Agra",
  gender: user.gender || "Male",
  latitude: numberOr(horoscope.latitude, 27.1767),
  longitude: numberOr(horoscope.longitude, 78.0081),
  timeZoneOffsetMinutes: numberOr(horoscope.timeZoneOffsetMinutes, 330),
  savedAt: horoscope.updatedAt || horoscope.createdAt,
  isProfile: true,
});

const listSavedKundlis = async (req, res, next) => {
  try {
    const [saved, horoscope] = await Promise.all([
      SavedKundli.find({ user: req.user._id }).sort({ createdAt: -1 }).lean(),
      Horoscope.findOne({ user: req.user._id }).lean(),
    ]);
    const items = saved.map(savedKundliItem);
    if (horoscope) {
      const profile = profileKundliItem(horoscope, req.user);
      const isAlreadySaved = saved.some(
        (item) =>
          new Date(item.dateOfBirth).getTime() ===
            new Date(profile.dateOfBirth).getTime() &&
          item.timeOfBirth === profile.timeOfBirth &&
          item.name === profile.name,
      );
      if (!isAlreadySaved) items.unshift(profile);
    }
    return res.status(200).json({
      success: true,
      data: { items },
    });
  } catch (error) {
    return next(error);
  }
};

const createSavedKundli = async (req, res, next) => {
  try {
    const {
      name,
      dateOfBirth,
      timeOfBirth,
      place,
      gender,
      latitude,
      longitude,
      timeZoneOffsetMinutes,
    } = req.body || {};
    const dob = new Date(dateOfBirth);
    const lat = Number(latitude);
    const lon = Number(longitude);
    const timezone = Number(timeZoneOffsetMinutes);
    const rawTime = String(timeOfBirth || "").trim();
    const timeMatch = rawTime.match(
      /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i,
    );
    const parsedTime = parseNormalizedTime(rawTime);
    const timeIsValid =
      timeMatch &&
      Number(timeMatch[1]) <= (timeMatch[4] ? 12 : 23) &&
      Number(timeMatch[1]) >= (timeMatch[4] ? 1 : 0) &&
      Number(timeMatch[2]) <= 59 &&
      Number(timeMatch[3] || 0) <= 59;
    if (
      Number.isNaN(dob.getTime()) ||
      !timeIsValid ||
      !String(place || "").trim() ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180 ||
      !Number.isFinite(timezone) ||
      timezone < -840 ||
      timezone > 840
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid birth details are required to save a Kundli.",
      });
    }
    const item = await SavedKundli.create({
      user: req.user._id,
      name: String(name || req.user.name || "Kundli").trim(),
      dateOfBirth: dob,
      timeOfBirth: parsedTime.formatted24.slice(0, 5),
      place: String(place).trim(),
      gender: String(gender || "Male").trim(),
      latitude: lat,
      longitude: lon,
      timeZoneOffsetMinutes: timezone,
    });
    return res.status(201).json({
      success: true,
      message: "Kundli saved",
      data: { item: savedKundliItem(item) },
    });
  } catch (error) {
    return next(error);
  }
};

const getSavedKundli = async (req, res, next) => {
  try {
    let details;
    if (req.params.id === "profile") {
      details = await Horoscope.findOne({ user: req.user._id }).lean();
      if (details) {
        details = {
          ...details,
          place: details.placeOfBirth || "Agra",
        };
      }
    } else {
      details = await SavedKundli.findOne({
        _id: req.params.id,
        user: req.user._id,
      }).lean();
    }
    if (!details) {
      return res.status(404).json({
        success: false,
        message: "Saved Kundli not found.",
      });
    }

    const parsedTime = parseNormalizedTime(details.timeOfBirth || "12:00");
    const result = await calculateFullKundli({
      name: details.name || req.user.name || "User",
      dateOfBirth: details.dateOfBirth,
      timeOfBirth: parsedTime.formatted24,
      place: details.place || details.placeOfBirth || "Agra",
      gender: details.gender || req.user.gender || "Male",
      latitude: numberOr(details.latitude, 27.1767),
      longitude: numberOr(details.longitude, 78.0081),
      timeZoneOffsetMinutes: numberOr(details.timeZoneOffsetMinutes, 330),
      save: false,
    });
    return res.status(200).json({
      success: true,
      message: "Saved Kundli retrieved",
      data: {
        summary: result.summary,
        navigation: result.navigation,
        categories: result.categories,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const deleteSavedKundli = async (req, res, next) => {
  try {
    if (req.params.id === "profile") {
      return res.status(400).json({
        success: false,
        message: "The profile Kundli cannot be deleted from this list.",
      });
    }
    const item = await SavedKundli.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Saved Kundli not found.",
      });
    }
    return res.status(200).json({ success: true, message: "Kundli deleted" });
  } catch (error) {
    return next(error);
  }
};

const matchFingerprint = (report) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        generatedAt: report.generatedAt,
        boy: [report.boy.dateLabel, report.boy.timeLabel, report.boy.name],
        girl: [report.girl.dateLabel, report.girl.timeLabel, report.girl.name],
      }),
    )
    .digest("hex");

const listSavedMatches = async (req, res, next) => {
  try {
    const matches = await SavedKundliMatch.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json({
      success: true,
      data: { matches: matches.map((item) => item.report) },
    });
  } catch (error) {
    return next(error);
  }
};

const saveKundliMatch = async (req, res, next) => {
  try {
    const report = req.body?.report;
    if (
      !report ||
      typeof report !== "object" ||
      !report.boy ||
      !report.girl ||
      !report.gunaMilan
    ) {
      return res.status(400).json({
        success: false,
        message: "A complete Kundli Milan report is required.",
      });
    }
    const fingerprint = matchFingerprint(report);
    await SavedKundliMatch.findOneAndUpdate(
      { user: req.user._id, fingerprint },
      {
        $set: { report },
        $setOnInsert: { user: req.user._id, fingerprint },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return res.status(200).json({
      success: true,
      message: "Kundli Milan saved",
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createSavedKundli,
  deleteSavedKundli,
  getSavedKundli,
  listSavedKundlis,
  listSavedMatches,
  saveKundliMatch,
};
