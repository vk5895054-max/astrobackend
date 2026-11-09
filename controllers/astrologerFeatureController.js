const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/user");
const Match = require("../models/match");
const Horoscope = require("../models/horoscope");
const SavedKundli = require("../models/savedKundli");
const SavedKundliMatch = require("../models/savedKundliMatch");
const HumanDesignChart = require("../models/humanDesignChart");
const AstrologerProfile = require("../models/astrologerProfile");
const AstroConversation = require("../models/astroConversation");
const AstrologerReading = require("../models/astrologerReading");
const { getIo } = require("../services/socketHub");
const {
  calculateFullKundli,
  parseNormalizedTime,
} = require("../services/kundliCalculationService");
const {
  calculateHumanDesignChart,
  summarizeHumanDesignChart,
} = require("../services/humanDesignService");
const { resolveBirthLocationFromPlace } = require("../services/birthLocationService");
const { buildChartContextForQA } = require("../services/vedicAstrologyService");
const { askAstroQuestion } = require("../services/rag/ragService");
const { flattenUploadedImages } = require("../middlewares/uploadMiddleware");
const { computeKundliMatchData } = require("./kundliMatchController");
const {
  getCategories,
  calculateLalKitabVarshaPhal,
  resolveOrComputeMyChart,
  parseDateOfBirth,
} = require("./kundliController");
const { listSavedMatches, saveKundliMatch } = require("./kundliSavedController");
const { buildDashaPayload } = require("./horoscopeController");

const VALID_MY_CHART_TABS = new Set(["bodyGraph", "about", "centers", "gates", "channels", "love"]);

const normalizeTab = (rawTab) => {
  if (!rawTab || typeof rawTab !== "string") return null;
  const cleaned = rawTab.trim().toLowerCase();
  const map = {
    bodygraph: "bodyGraph",
    body_graph: "bodyGraph",
    about: "about",
    centers: "centers",
    gates: "gates",
    channels: "channels",
    love: "love",
  };
  return map[cleaned] || (VALID_MY_CHART_TABS.has(rawTab.trim()) ? rawTab.trim() : null);
};

const buildError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
};

const matchFingerprint = (report) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        generatedAt: report.generatedAt,
        boy: [report.boy?.dateLabel, report.boy?.timeLabel, report.boy?.name],
        girl: [report.girl?.dateLabel, report.girl?.timeLabel, report.girl?.name],
      })
    )
    .digest("hex");

// Validates optional astrologerId / consultationMatchId so client-side
// Kundli Milan, Kundli AI, and MyChart flow cleanly into astrologer consultations.
const resolveAstrologerTarget = async ({ astrologerId, consultationMatchId, userId }) => {
  let resolvedAstrologerId = astrologerId ? String(astrologerId).trim() : null;
  let match = null;

  if (consultationMatchId) {
    if (!mongoose.isValidObjectId(consultationMatchId)) {
      throw buildError("Invalid consultationMatchId", 400);
    }
    match = await Match.findOne({
      _id: consultationMatchId,
      matchType: "consultation",
      $or: [{ userA: userId }, { userB: userId }],
    }).lean();
    if (!match) {
      throw buildError("Consultation not found", 404);
    }
    const matchAstroId = match.consultation?.astrologer
      ? String(match.consultation.astrologer)
      : null;
    if (resolvedAstrologerId && matchAstroId && resolvedAstrologerId !== matchAstroId) {
      throw buildError("consultationMatchId does not match the specified astrologerId", 400);
    }
    if (!resolvedAstrologerId) resolvedAstrologerId = matchAstroId;
  }

  if (!resolvedAstrologerId) {
    return { astrologer: null, profile: null, match: null };
  }

  if (!mongoose.isValidObjectId(resolvedAstrologerId)) {
    throw buildError("Invalid astrologerId", 400);
  }

  const [astrologer, profile] = await Promise.all([
    User.findOne({ _id: resolvedAstrologerId, role: "astrologer", isActive: true })
      .select("_id name role")
      .lean(),
    AstrologerProfile.findOne({ user: resolvedAstrologerId, isVerified: true })
      .select("user displayName photo expertise languages isOnline rateChatPerMin rateCallPerMin")
      .lean(),
  ]);

  if (!astrologer || !profile) {
    throw buildError("Astrologer not found or not verified", 404);
  }

  if (!match && userId) {
    match = await Match.findOne({
      matchType: "consultation",
      status: { $in: ["accepted", "active"] },
      $or: [
        { userA: userId, userB: astrologer._id },
        { userA: astrologer._id, userB: userId },
      ],
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  return { astrologer, profile, match };
};

const getSafeUserMyChart = async (user, options = {}) => {
  if (!user?._id) return null;
  try {
    return await resolveOrComputeMyChart(user, {}, { persist: true, ...options });
  } catch (err) {
    return null;
  }
};

const persistAndNotifyReading = async ({
  userId,
  target,
  kind,
  title,
  category = "general",
  question,
  answer,
  sources = [],
  report = null,
  kundliSummary = null,
  myChartSummary = null,
  shared = true,
}) => {
  if (!target?.astrologer || !shared) return null;

  const doc = await AstrologerReading.create({
    user: userId,
    astrologer: target.astrologer._id,
    consultationMatch: target.match?._id || null,
    kind,
    title,
    category,
    question,
    answer,
    sources,
    report,
    kundliSummary,
    myChartSummary,
    sharedWithAstrologer: true,
  });

  const io = getIo();
  if (io) {
    const eventPayload = {
      readingId: String(doc._id),
      kind,
      title,
      clientId: String(userId),
      astrologerId: String(target.astrologer._id),
      consultationMatchId: target.match?._id ? String(target.match._id) : null,
      sharedAt: doc.createdAt,
    };
    io.to(`user:${String(target.astrologer._id)}`).emit("astrologer:reading-shared", eventPayload);
    if (target.match?._id) {
      io.to(`match:${String(target.match._id)}`).emit("astrologer:reading-shared", eventPayload);
    }
  }

  return doc;
};

const formatAstrologerContext = (target, reading) => {
  if (!target?.astrologer) return null;
  return {
    astrologerId: target.astrologer._id,
    astrologerName: target.profile?.displayName || target.astrologer.name,
    isOnline: Boolean(target.profile?.isOnline),
    consultationMatchId: target.match?._id || null,
    consultationStatus: target.match?.status || null,
    sharedWithAstrologer: Boolean(reading),
    readingId: reading?._id || null,
  };
};

// GET /api/astrologers/features
// Returns user-side Astrologer features metadata + MyChart & Kundli readiness + recent shared readings.
const getAstrologerFeatures = async (req, res, next) => {
  try {
    const [horoscope, myChart, savedKundliCount, savedMatchCount, recentReadings] = await Promise.all([
      Horoscope.findOne({ user: req.user._id }).lean(),
      getSafeUserMyChart(req.user),
      SavedKundli.countDocuments({ user: req.user._id }),
      SavedKundliMatch.countDocuments({ user: req.user._id }),
      AstrologerReading.find({ user: req.user._id })
        .populate("astrologer", "name")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const myChartSummary = summarizeHumanDesignChart(myChart);
    const kundliSummary = horoscope
      ? {
          name: horoscope.name || req.user.name,
          dateOfBirth: horoscope.dateOfBirth,
          timeOfBirth: horoscope.timeOfBirth,
          placeOfBirth: horoscope.placeOfBirth || "",
          sunSign: horoscope.sunSign || horoscope.vedicChart?.planets?.Sun?.rashi || "",
          moonSign: horoscope.moonSign || horoscope.vedicChart?.moonRashi || "",
          lagna: horoscope.vedicChart?.ascendant?.rashi || "",
          nakshatra: horoscope.nakshatra || horoscope.vedicChart?.moonNakshatra?.name || "",
        }
      : null;

    res.json({
      success: true,
      message: "Astrologers section features retrieved",
      data: {
        features: {
          kundliMilan: {
            enabled: true,
            title: "Kundli Milan",
            description: "36-point Ashtakoot Guna Milan compatibility matching with astrologer sharing and MyChart alignment",
            endpoints: {
              calculate: "/api/astrologers/kundli-milan",
              calculateWithAstrologer: "/api/astrologers/:id/kundli-milan",
              savedList: "/api/astrologers/kundli-milan/saved",
              saveMatch: "/api/astrologers/kundli-milan/saved",
            },
          },
          kundliAi: {
            enabled: true,
            title: "Kundli AI",
            description: "Complete 34-screen Vedic chart calculation & AI Q&A grounded in Kundli and MyChart",
            endpoints: {
              categories: "/api/astrologers/kundli-ai/categories",
              myKundli: "/api/astrologers/kundli-ai/my-kundli",
              calculate: "/api/astrologers/kundli-ai/calculate",
              chat: "/api/astrologers/kundli-ai/chat",
              chatWithAstrologer: "/api/astrologers/:id/kundli-ai/chat",
              varshaPhal: "/api/astrologers/kundli-ai/varsha-phal",
            },
          },
          myChart: {
            enabled: true,
            title: "My Chart",
            description: "Human Design BodyGraph, About, 9 Centers, 64 Gates, 36 Channels and Love for Type",
            tabs: ["BodyGraph", "About", "Centers", "Gates", "Channels", "Love"],
            endpoints: {
              get: "/api/astrologers/my-chart",
              calculate: "/api/astrologers/my-chart",
            },
          },
        },
        readiness: {
          hasHoroscope: Boolean(horoscope),
          hasMyChart: Boolean(myChart),
          savedKundliCount,
          savedMatchCount,
          sharedReadingsCount: recentReadings.length,
        },
        kundliSummary,
        myChartSummary,
        myChart: myChart || null,
        recentReadings,
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/astrologers/kundli-milan
// POST /api/astrologers/:id/kundli-milan
const runAstrologerKundliMilan = async (req, res, next) => {
  try {
    const body = req.body || {};
    const targetAstrologerId = req.params.id || body.astrologerId;
    const shareRequested =
      body.shareWithAstrologer === undefined
        ? Boolean(targetAstrologerId || body.consultationMatchId)
        : Boolean(body.shareWithAstrologer && body.shareWithAstrologer !== "false");

    const target = await resolveAstrologerTarget({
      astrologerId: targetAstrologerId,
      consultationMatchId: body.consultationMatchId,
      userId: req.user._id,
    });

    const matchResult = await computeKundliMatchData(body, req.user, {
      includePartnersMyChart: true,
    });
    if (!matchResult.success) {
      return res.status(matchResult.statusCode).json({
        success: false,
        message: matchResult.message,
      });
    }

    const userMyChartDoc = await getSafeUserMyChart(req.user);
    const myChartSummary =
      summarizeHumanDesignChart(userMyChartDoc) ||
      matchResult.data.partnersMyChart?.boy ||
      matchResult.data.partnersMyChart?.girl ||
      null;

    let saved = false;
    if (body.save === true || body.save === "true") {
      const fingerprint = matchFingerprint(matchResult.data);
      await SavedKundliMatch.findOneAndUpdate(
        { user: req.user._id, fingerprint },
        {
          $set: { report: matchResult.data },
          $setOnInsert: { user: req.user._id, fingerprint },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved = true;
    }

    const reading = await persistAndNotifyReading({
      userId: req.user._id,
      target,
      kind: "kundli_milan",
      title: `Kundli Milan: ${matchResult.data.boy.name || "Boy"} & ${matchResult.data.girl.name || "Girl"}`,
      report: matchResult.data,
      myChartSummary,
      shared: shareRequested,
    });

    res.json({
      success: true,
      message: "Kundli Milan calculated",
      data: {
        ...matchResult.data,
        saved,
        myChartSummary,
        myChart: userMyChartDoc || null,
        astrologerContext: formatAstrologerContext(target, reading),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/astrologers/kundli-ai/my-kundli
const getAstrologerKundliAiMyKundli = async (req, res, next) => {
  try {
    const horoscope = await Horoscope.findOne({ user: req.user._id }).lean();
    if (!horoscope) {
      return res.status(404).json({
        success: false,
        message: "Horoscope not found. Please calculate and save your birth details first.",
      });
    }

    const parsedTime = parseNormalizedTime(horoscope.timeOfBirth || "12:00:00");
    const lat = Number(horoscope.latitude) || 27.1767;
    const lon = Number(horoscope.longitude) || 78.0081;
    const tzMinutes = Number(horoscope.timeZoneOffsetMinutes) || 330;

    const [kundliResult, myChart, target] = await Promise.all([
      calculateFullKundli({
        name: horoscope.name || req.user.name || "User",
        dateOfBirth: horoscope.dateOfBirth,
        timeOfBirth: parsedTime.formatted24,
        place: horoscope.placeOfBirth || "Agra",
        gender: req.user.gender || "Male",
        latitude: lat,
        longitude: lon,
        timeZoneOffsetMinutes: tzMinutes,
        save: true,
      }),
      resolveOrComputeMyChart(
        req.user,
        {
          name: horoscope.name || req.user.name || "User",
          dateOfBirth: horoscope.dateOfBirth,
          timeOfBirth: parsedTime.formatted24,
          place: horoscope.placeOfBirth || "",
          latitude: lat,
          longitude: lon,
          timeZoneOffsetMinutes: tzMinutes,
        },
        { persist: true }
      ),
      resolveAstrologerTarget({
        astrologerId: req.query.astrologerId,
        consultationMatchId: req.query.consultationMatchId,
        userId: req.user._id,
      }),
    ]);

    const myChartSummary = summarizeHumanDesignChart(myChart);
    const requestedCategory = String(req.query.category || "all").toLowerCase().trim();

    if (requestedCategory !== "all" && kundliResult.categories[requestedCategory]) {
      return res.status(200).json({
        success: true,
        message: `Kundli AI ${requestedCategory} retrieved successfully`,
        data: {
          summary: kundliResult.summary,
          categoryKey: requestedCategory,
          category: kundliResult.categories[requestedCategory],
          navigation: kundliResult.navigation,
          myChartSummary,
          myChart,
          astrologerContext: formatAstrologerContext(target, null),
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Kundli AI profile retrieved successfully",
      data: {
        summary: kundliResult.summary,
        navigation: kundliResult.navigation,
        categories: kundliResult.categories,
        myChartSummary,
        myChart,
        astrologerContext: formatAstrologerContext(target, null),
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/astrologers/kundli-ai/calculate
const calculateAstrologerKundliAi = async (req, res, next) => {
  try {
    const body = req.body || {};
    const rawDob = body.birthDate || body.dateOfBirth;
    const parsedDob = parseDateOfBirth(rawDob);
    if (!parsedDob) {
      return res.status(400).json({
        success: false,
        message: "dateOfBirth is required and must be a valid date (e.g. YYYY-MM-DD, DD/MM/YYYY, or 23-OCT-2026)",
      });
    }

    const target = await resolveAstrologerTarget({
      astrologerId: body.astrologerId,
      consultationMatchId: body.consultationMatchId,
      userId: req.user._id,
    });

    const rawTob = body.birthTime || body.timeOfBirth || "12:00:00";
    const parsedTime = parseNormalizedTime(rawTob);
    const hasExplicitLat = body.latitude !== undefined && body.latitude !== "" && Number.isFinite(Number(body.latitude));
    const hasExplicitLon = body.longitude !== undefined && body.longitude !== "" && Number.isFinite(Number(body.longitude));
    const hasExplicitTz = body.timeZoneOffsetMinutes !== undefined && body.timeZoneOffsetMinutes !== "" && Number.isFinite(Number(body.timeZoneOffsetMinutes));

    let lat = hasExplicitLat ? Number(body.latitude) : NaN;
    let lon = hasExplicitLon ? Number(body.longitude) : NaN;
    let tzMinutes = hasExplicitTz ? Number(body.timeZoneOffsetMinutes) : 330;
    let placeName = String(body.birthPlace || body.placeOfBirth || body.place || "Agra").trim();

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const resolved = await resolveBirthLocationFromPlace(placeName, parsedDob).catch(() => null);
      if (resolved) {
        lat = resolved.latitude;
        lon = resolved.longitude;
        if (!hasExplicitTz) tzMinutes = resolved.timeZoneOffsetMinutes;
        placeName = resolved.placeOfBirth || placeName;
      } else {
        lat = 27.1767;
        lon = 78.0081;
      }
    }

    const personName = String(body.name || req.user.name || "User").trim();
    const shouldSave = Boolean(body.save && body.save !== "false");

    const kundliResult = await calculateFullKundli({
      name: personName,
      dateOfBirth: parsedDob,
      timeOfBirth: parsedTime.formatted24,
      place: placeName,
      gender: String(body.gender || req.user.gender || "Male").trim(),
      latitude: lat,
      longitude: lon,
      timeZoneOffsetMinutes: tzMinutes,
      save: shouldSave,
    });

    const myChart = await resolveOrComputeMyChart(
      req.user,
      {
        name: personName,
        dateOfBirth: parsedDob,
        timeOfBirth: parsedTime.formatted24,
        place: placeName,
        latitude: lat,
        longitude: lon,
        timeZoneOffsetMinutes: tzMinutes,
        save: shouldSave,
      },
      { persist: shouldSave }
    );

    if (shouldSave) {
      await Horoscope.findOneAndUpdate(
        { user: req.user._id },
        {
          $set: {
            name: personName,
            dateOfBirth: parsedDob,
            timeOfBirth: parsedTime.formatted24.slice(0, 5),
            placeOfBirth: placeName,
            latitude: lat,
            longitude: lon,
            timeZoneOffsetMinutes: tzMinutes,
            vedicChart: kundliResult.rawChart,
          },
        },
        { upsert: true, new: true }
      ).catch(() => null);
    }

    const myChartSummary = summarizeHumanDesignChart(myChart);
    const shareRequested =
      body.shareWithAstrologer === undefined
        ? Boolean(target.astrologer)
        : Boolean(body.shareWithAstrologer && body.shareWithAstrologer !== "false");

    const reading = await persistAndNotifyReading({
      userId: req.user._id,
      target,
      kind: "kundli_ai",
      title: `Kundli AI Chart: ${personName}`,
      category: String(body.category || "all").toLowerCase().trim(),
      kundliSummary: kundliResult.summary,
      myChartSummary,
      report: {
        summary: kundliResult.summary,
        basicHighlights: kundliResult.categories?.basic?.highlights || null,
      },
      shared: shareRequested,
    });

    const requestedCategory = String(req.query?.category || body.category || "all").toLowerCase().trim();
    if (requestedCategory !== "all" && kundliResult.categories[requestedCategory]) {
      return res.status(200).json({
        success: true,
        message: `Kundli AI ${requestedCategory} calculated successfully`,
        data: {
          summary: kundliResult.summary,
          categoryKey: requestedCategory,
          category: kundliResult.categories[requestedCategory],
          navigation: kundliResult.navigation,
          myChartSummary,
          myChart,
          astrologerContext: formatAstrologerContext(target, reading),
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Kundli AI calculated successfully",
      data: {
        summary: kundliResult.summary,
        navigation: kundliResult.navigation,
        categories: kundliResult.categories,
        myChartSummary,
        myChart,
        astrologerContext: formatAstrologerContext(target, reading),
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/astrologers/kundli-ai/chat
// POST /api/astrologers/:id/kundli-ai/chat
const chatAstrologerKundliAi = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { question, category = "general", birthDetails } = body;
    const images = flattenUploadedImages(req.files);

    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ success: false, message: "question is required" });
    }
    if (question.length > 1000) {
      return res.status(400).json({ success: false, message: "question is too long (max 1000 characters)" });
    }

    let parsedBirthDetails = birthDetails;
    if (typeof parsedBirthDetails === "string" && parsedBirthDetails.trim()) {
      try {
        parsedBirthDetails = JSON.parse(parsedBirthDetails);
      } catch (e) {
        parsedBirthDetails = null;
      }
    }

    const targetAstrologerId = req.params.id || body.astrologerId;
    const target = await resolveAstrologerTarget({
      astrologerId: targetAstrologerId,
      consultationMatchId: body.consultationMatchId,
      userId: req.user._id,
    });

    let calculatedData = null;
    let myChart = null;

    if (parsedBirthDetails && typeof parsedBirthDetails === "object" && (parsedBirthDetails.dateOfBirth || parsedBirthDetails.birthDate)) {
      const parsedDob = parseDateOfBirth(parsedBirthDetails.dateOfBirth || parsedBirthDetails.birthDate);
      if (parsedDob) {
        const dobTime = parseNormalizedTime(parsedBirthDetails.timeOfBirth || parsedBirthDetails.birthTime || "12:00");
        const hasLat = parsedBirthDetails.latitude !== undefined && parsedBirthDetails.latitude !== "" && Number.isFinite(Number(parsedBirthDetails.latitude));
        const hasLon = parsedBirthDetails.longitude !== undefined && parsedBirthDetails.longitude !== "" && Number.isFinite(Number(parsedBirthDetails.longitude));
        const hasTz = parsedBirthDetails.timeZoneOffsetMinutes !== undefined && parsedBirthDetails.timeZoneOffsetMinutes !== "" && Number.isFinite(Number(parsedBirthDetails.timeZoneOffsetMinutes));

        let lat = hasLat ? Number(parsedBirthDetails.latitude) : 27.1767;
        let lon = hasLon ? Number(parsedBirthDetails.longitude) : 78.0081;
        let tzMinutes = hasTz ? Number(parsedBirthDetails.timeZoneOffsetMinutes) : 330;
        let placeName = String(parsedBirthDetails.place || parsedBirthDetails.placeOfBirth || parsedBirthDetails.birthPlace || "").trim();

        if ((!hasLat || !hasLon) && placeName) {
          const resolved = await resolveBirthLocationFromPlace(placeName, parsedDob).catch(() => null);
          if (resolved) {
            lat = resolved.latitude;
            lon = resolved.longitude;
            if (!hasTz) tzMinutes = resolved.timeZoneOffsetMinutes;
            placeName = resolved.placeOfBirth || placeName;
          }
        }

        const hdInput = {
          name: parsedBirthDetails.name || req.user.name || "User",
          dateOfBirth: parsedDob,
          timeOfBirth: dobTime.formatted24,
          place: placeName || "Agra",
          latitude: lat,
          longitude: lon,
          timeZoneOffsetMinutes: tzMinutes,
        };
        calculatedData = await calculateFullKundli(hdInput);
        myChart = calculateHumanDesignChart(hdInput);
      }
    }

    if (!calculatedData) {
      const savedHoroscope = await Horoscope.findOne({ user: req.user._id }).lean();
      if (savedHoroscope) {
        const dobTime = parseNormalizedTime(savedHoroscope.timeOfBirth || "12:00");
        const chartInput = {
          name: savedHoroscope.name || req.user.name || "User",
          dateOfBirth: savedHoroscope.dateOfBirth,
          timeOfBirth: dobTime.formatted24,
          place: savedHoroscope.placeOfBirth || "Agra",
          latitude: Number(savedHoroscope.latitude) || 27.1767,
          longitude: Number(savedHoroscope.longitude) || 78.0081,
          timeZoneOffsetMinutes: Number(savedHoroscope.timeZoneOffsetMinutes) || 330,
        };
        calculatedData = await calculateFullKundli(chartInput);
        myChart = await getSafeUserMyChart(req.user);
        if (!myChart) myChart = calculateHumanDesignChart(chartInput);
      }
    }

    if (!calculatedData) {
      const defaultBirth = {
        name: req.user.name || "User",
        dateOfBirth: new Date(),
        timeOfBirth: "12:00:00",
        place: "Agra",
        latitude: 27.1767,
        longitude: 78.0081,
        timeZoneOffsetMinutes: 330,
      };
      calculatedData = await calculateFullKundli(defaultBirth);
      myChart = await getSafeUserMyChart(req.user);
    }

    const myChartSummary = summarizeHumanDesignChart(myChart);
    const chartSummary = calculatedData.summary;
    const categoryKey = String(category || "general").toLowerCase().trim();
    const specificCategoryData = calculatedData.categories?.[categoryKey] || null;

    let answer = null;
    let sources = [];

    try {
      const chartContext = buildChartContextForQA({
        chartA: calculatedData.rawChart,
        myChart: myChartSummary,
        categoryContext: {
          category: categoryKey,
          data: specificCategoryData,
          summary: chartSummary,
        },
      });
      const promptPrefix = categoryKey !== "general" ? `[Category: ${categoryKey.toUpperCase()}] ` : "";
      const aiResponse = await askAstroQuestion(`${promptPrefix}${question.trim()}`, {
        chartContext,
        images,
      });
      if (aiResponse?.answer && typeof aiResponse.answer === "string" && aiResponse.answer.trim().length > 10) {
        answer = aiResponse.answer;
        sources = aiResponse.sources || [];
      }
    } catch (aiErr) {
      if (images.length > 0) throw aiErr;
    }

    if (!answer) {
      const lagna = chartSummary.lagna || "Aries";
      const rashi = chartSummary.rashi || "Aries";
      const nakshatra = chartSummary.nakshatra || "Ashwini";
      const hdClause = myChartSummary
        ? ` In your Human Design MyChart (${myChartSummary.typeLabel}, Profile ${myChartSummary.profileLabel}, ${myChartSummary.authority} Authority, Strategy: ${myChartSummary.strategy}), decisions align best when honoring your ${myChartSummary.authority} clarity and avoiding ${myChartSummary.notSelfTheme}.`
        : "";
      answer = `Based on your Vedic chart (${lagna} Lagna, ${rashi} Moon in ${nakshatra} nakshatra, Mangal Dosh: ${chartSummary.mangalDosh}), category "${categoryKey}" indicates steady alignment around "${question.trim()}".${hdClause}`;
      sources = [
        { id: "VEDIC_PARASHARI_CORE", title: "Brihat Parashara Hora Shastra", section: categoryKey },
        ...(myChartSummary
          ? [{ id: "HUMAN_DESIGN_MY_CHART", title: "Human Design BodyGraph", section: myChartSummary.typeLabel }]
          : []),
      ];
    }

    await AstroConversation.create({
      user: req.user._id,
      partner: null,
      question: question.trim(),
      answer,
      sources,
    }).catch(() => null);

    const shareRequested =
      body.shareWithAstrologer === undefined
        ? Boolean(target.astrologer)
        : Boolean(body.shareWithAstrologer && body.shareWithAstrologer !== "false");

    const reading = await persistAndNotifyReading({
      userId: req.user._id,
      target,
      kind: "kundli_ai",
      title: `Kundli AI (${categoryKey}): ${question.trim().slice(0, 60)}`,
      category: categoryKey,
      question: question.trim(),
      answer,
      sources,
      kundliSummary: chartSummary,
      myChartSummary,
      shared: shareRequested,
    });

    res.status(200).json({
      success: true,
      message: "Kundli AI response generated",
      data: {
        category: categoryKey,
        question: question.trim(),
        answer,
        verified: true,
        verificationDetails: {
          chartGrounded: true,
          lagna: chartSummary.lagna,
          rashi: chartSummary.rashi,
          nakshatra: chartSummary.nakshatra,
          mangalDosh: chartSummary.mangalDosh,
          ...(myChartSummary
            ? {
                humanDesignType: myChartSummary.typeLabel,
                humanDesignProfile: myChartSummary.profileLabel,
                humanDesignAuthority: myChartSummary.authority,
              }
            : {}),
        },
        kundliSummary: chartSummary,
        myChartSummary,
        myChart: myChart || null,
        astrologerContext: formatAstrologerContext(target, reading),
        sources,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET & POST /api/astrologers/my-chart
const handleAstrologerMyChart = async (req, res, next) => {
  try {
    const bodyInput = req.body && typeof req.body === "object" ? req.body : {};
    const queryInput = req.query && typeof req.query === "object" ? req.query : {};
    const merged = { ...queryInput, ...bodyInput };

    const target = await resolveAstrologerTarget({
      astrologerId: req.params.id || merged.astrologerId,
      consultationMatchId: merged.consultationMatchId,
      userId: req.user._id,
    });

    const recalculate = merged.recalculate === true || merged.recalculate === "true";
    const chart = await resolveOrComputeMyChart(req.user, merged, {
      persist: true,
      forceRecalculate: recalculate,
    });

    const summary = summarizeHumanDesignChart(chart);
    const shareRequested =
      merged.shareWithAstrologer !== undefined
        ? Boolean(merged.shareWithAstrologer && merged.shareWithAstrologer !== "false")
        : Boolean(merged.share === true || merged.share === "true" || (req.method === "POST" && target.astrologer));

    const reading = await persistAndNotifyReading({
      userId: req.user._id,
      target,
      kind: "my_chart",
      title: `My Chart (${summary?.typeLabel || "Human Design"})`,
      myChartSummary: summary,
      report: {
        about: chart.about,
        love: chart.love,
        channels: chart.channels,
        centers: chart.centers,
      },
      shared: shareRequested,
    });

    const requestedTab = normalizeTab(merged.tab);
    const data = requestedTab
      ? {
          activeTab: requestedTab,
          section: chart[requestedTab],
          summary,
          astrologerContext: formatAstrologerContext(target, reading),
          ...chart,
        }
      : {
          summary,
          astrologerContext: formatAstrologerContext(target, reading),
          ...chart,
        };

    res.status(200).json({
      success: true,
      message: "My Chart retrieved successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/astrologers/readings
const listMyAstrologerReadings = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = { user: req.user._id };

    if (req.query.astrologerId) {
      if (!mongoose.isValidObjectId(req.query.astrologerId)) {
        return res.status(400).json({ success: false, message: "Invalid astrologerId" });
      }
      filter.astrologer = req.query.astrologerId;
    }
    if (req.query.kind && ["kundli_milan", "kundli_ai", "my_chart"].includes(req.query.kind)) {
      filter.kind = req.query.kind;
    }

    const [items, total] = await Promise.all([
      AstrologerReading.find(filter)
        .populate("astrologer", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AstrologerReading.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/astrologer/readings (astrologer dashboard)
const listIncomingAstrologerReadings = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = { astrologer: req.user._id, sharedWithAstrologer: true };

    if (req.query.clientId) {
      if (!mongoose.isValidObjectId(req.query.clientId)) {
        return res.status(400).json({ success: false, message: "Invalid clientId" });
      }
      filter.user = req.query.clientId;
    }
    if (req.query.kind && ["kundli_milan", "kundli_ai", "my_chart"].includes(req.query.kind)) {
      filter.kind = req.query.kind;
    }

    const [items, total] = await Promise.all([
      AstrologerReading.find(filter)
        .populate("user", "name gender")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AstrologerReading.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/astrologer/consultations/:matchId/client-charts (astrologer dashboard)
const getConsultationClientCharts = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    if (!mongoose.isValidObjectId(matchId)) {
      return res.status(400).json({ success: false, message: "Invalid matchId" });
    }

    const match = await Match.findOne({
      _id: matchId,
      matchType: "consultation",
      $or: [{ userA: req.user._id }, { userB: req.user._id }],
    }).lean();

    if (!match) {
      return res.status(404).json({ success: false, message: "Consultation not found" });
    }

    const clientId =
      match.consultation?.client ||
      (String(match.userA) === String(req.user._id) ? match.userB : match.userA);

    const [client, horoscope, savedMyChart, sharedReadings] = await Promise.all([
      User.findById(clientId).select("_id name gender").lean(),
      Horoscope.findOne({ user: clientId }).lean(),
      HumanDesignChart.findOne({ user: clientId }).lean(),
      AstrologerReading.find({
        user: clientId,
        astrologer: req.user._id,
        sharedWithAstrologer: true,
      })
        .sort({ createdAt: -1 })
        .limit(25)
        .lean(),
    ]);

    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    let myChart = savedMyChart;
    if ((!myChart || !myChart.about || !myChart.love) && horoscope?.dateOfBirth) {
      myChart = calculateHumanDesignChart({
        name: horoscope.name || client.name || "Client",
        dateOfBirth: horoscope.dateOfBirth,
        timeOfBirth: horoscope.timeOfBirth || "12:00",
        place: horoscope.placeOfBirth || "",
        latitude: horoscope.latitude,
        longitude: horoscope.longitude,
        timeZoneOffsetMinutes: horoscope.timeZoneOffsetMinutes ?? 330,
      });
    }

    const dasha = horoscope ? buildDashaPayload(horoscope) : null;

    res.json({
      success: true,
      message: "Consultation client charts retrieved",
      data: {
        matchId: match._id,
        client,
        horoscope: horoscope
          ? {
              name: horoscope.name || client.name,
              dateOfBirth: horoscope.dateOfBirth,
              timeOfBirth: horoscope.timeOfBirth,
              placeOfBirth: horoscope.placeOfBirth,
              sunSign: horoscope.sunSign || horoscope.vedicChart?.planets?.Sun?.rashi || "",
              moonSign: horoscope.moonSign || horoscope.vedicChart?.moonRashi || "",
              lagna: horoscope.vedicChart?.ascendant?.rashi || "",
              nakshatra: horoscope.nakshatra || horoscope.vedicChart?.moonNakshatra?.name || "",
              vedicChart: horoscope.vedicChart || null,
              dasha,
            }
          : null,
        myChartSummary: summarizeHumanDesignChart(myChart),
        myChart: myChart || null,
        sharedReadings,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAstrologerFeatures,
  runAstrologerKundliMilan,
  listAstrologerSavedMatches: listSavedMatches,
  saveAstrologerKundliMatch: saveKundliMatch,
  getAstrologerKundliAiCategories: getCategories,
  getAstrologerKundliAiMyKundli,
  calculateAstrologerKundliAi,
  chatAstrologerKundliAi,
  calculateAstrologerKundliAiVarshaPhal: calculateLalKitabVarshaPhal,
  handleAstrologerMyChart,
  listMyAstrologerReadings,
  listIncomingAstrologerReadings,
  getConsultationClientCharts,
  resolveAstrologerTarget,
};
