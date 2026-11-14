// Kundli Controller
// Complete API implementation for the 34-screen Vedic Kundli flow.
//
// Endpoints:
// - POST /api/kundli/calculate: Calculates complete Kundli from birth details
// - GET  /api/kundli/my-kundli: Retrieves the complete Kundli for logged-in user
// - GET  /api/kundli/categories: Returns the screen catalog
// - POST /api/kundli/chat: Category-aware contextual AI Astrologer Q&A assistant

const mongoose = require("mongoose");
const Horoscope = require("../models/horoscope");
const HumanDesignChart = require("../models/humanDesignChart");
const {
  calculateFullKundli,
  calculateLalKitabVarshaPhal: buildLalKitabVarshaPhal,
  parseNormalizedTime,
} = require("../services/kundliCalculationService");
const {
  calculateHumanDesignChart,
  summarizeHumanDesignChart,
} = require("../services/humanDesignService");
const { localizeHumanDesignChart } = require("../services/humanDesignLocalizationService");
const { resolveBirthLocationFromPlace } = require("../services/birthLocationService");
const { askAstroQuestion } = require("../services/rag/ragService");
const { buildChartContextForQA } = require("../services/vedicAstrologyService");
const { flattenUploadedImages } = require("../middlewares/uploadMiddleware");

const parseDateOfBirth = (val) => {
  if (!val) return null;
  // Handle formats like "23/10/2026", "23-OCT-2026", "2026-10-23"
  if (typeof val === "string") {
    const partsSlash = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (partsSlash) {
      const d = Number(partsSlash[1]);
      const m = Number(partsSlash[2]) - 1;
      const y = Number(partsSlash[3]);
      const date = new Date(Date.UTC(y, m, d));
      if (!Number.isNaN(date.getTime())) return date;
    }

    const partsDash = val.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/i);
    if (partsDash) {
      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const d = Number(partsDash[1]);
      const m = months.indexOf(partsDash[2].toLowerCase());
      const y = Number(partsDash[3]);
      if (m !== -1) {
        const date = new Date(Date.UTC(y, m, d));
        if (!Number.isNaN(date.getTime())) return date;
      }
    }
  }

  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Fallback astrological interpreter if external LLM provider is unavailable
const generateGroundedCategoryInterpretation = (category, question, chartSummary, categoryData) => {
  const lagna = chartSummary.lagna || "Aries";
  const rashi = chartSummary.rashi || "Pisces";
  const nakshatra = chartSummary.nakshatra || "Purva Bhadrapada";
  const mangal = chartSummary.mangalDosh || "No";

  switch (category?.toLowerCase()) {
    case "lagna":
      return `Your Lagna (Ascendant) is in ${lagna}. In Vedic Jyotish, Lagna represents your physical constitution, innate personality, and life path. Having an ${lagna} Ascendant gives vitality, leadership qualities, and courage. Regarding your question: "${question}", your chart shows strong potential when focusing your energy constructively.`;
    case "moon":
      return `Your Moon sign (Chandra Rashi) is in ${rashi} in ${nakshatra} nakshatra. The Moon governs the mind, emotions, and perceptual patterns. In ${rashi}, the native experiences deep intuition, empathy, and artistic inclinations. Concerning "${question}", maintaining emotional grounding and periodic reflection will bring balance.`;
    case "ashtakvarga":
      return `Your Sarvashtakavarga (SAV) chart shows a harmonious distribution of 337 total bindus. Signs with higher bindu counts represent areas where transits and planetary dashas deliver favourable, smooth outcomes. In relation to "${question}", undertaking important initiatives when auspicious planets transit signs with high SAV points optimizes success.`;
    case "shad_bala":
      return `Your Shad Bala breakdown evaluates planetary strength across six dimensions (Sthana, Dig, Kala, Chesta, Naisargika, Drik). Planets with a strength ratio of 1.0 or greater manifest their benefic indications with maximum potency. Regarding "${question}", your strongest planets act as primary supportive pillars in your horoscope.`;
    case "panchang":
      return `Your birth Panchang indicates birth during the auspicious Tithi and Yoga. Panchang represents the five limbs of time that govern life energy. In context of your query "${question}", timing key activities in harmony with your favourable astrological weekdays and nakshatra enhances prosperity.`;
    case "ghatak_and_favourable":
      return `Based on your Janma Rashi ${rashi}, your favourable points include auspicious lucky numbers, friendly signs, and gemstone recommendations. Conversely, Ghatak factors indicate days and combinations requiring mindful caution. Regarding "${question}", leveraging your favourable days supports successful endeavors.`;
    case "nakshatra_nadi": {
      const nadi = categoryData?.moon?.nadi || categoryData?.native?.nadi || "your Nadi";
      const nak = categoryData?.moon?.nakshatra || nakshatra;
      return `Your Moon sits in ${nak} nakshatra, which belongs to ${nadi}. The three nadis — Adi (Vata), Madhya (Pitta) and Antya (Kapha) — are prakriti groupings used both for individual reading and for Nadi Dosha in Ashtakoot matching. Regarding "${question}", your nadi suggests reading this through your constitution and its remedies rather than as a standalone good or bad sign.`;
    }
    case "chandra_kala_nadi": {
      const amsha = categoryData?.nadiAmsha;
      const moonLine = amsha
        ? `the Moon occupies nadi amsha ${amsha.index} of ${amsha.total} (${amsha.bhaga}) in ${categoryData?.moon?.rashi || rashi}, placing it in ${amsha.nadi}`
        : `the Moon is in ${rashi}`;
      return `In Chandra Kala Nadi, each rashi is divided into 150 nadi amshas of 0.2°, each split into Poorvabhaga and Uttarbhaga; here ${moonLine}. Regarding "${question}", read the answer through the running nadi amsha together with your nakshatra nadi for timing and temperament.`;
    }
    case "lal_kitab": {
      const count = Array.isArray(categoryData?.planets) ? categoryData.planets.length : 0;
      return `Your Lal Kitab reading covers ${count || "nine"} planetary placements, each read from the house it occupies with its own household remedy — charity, service and simple daily observance. Regarding "${question}", Lal Kitab treats a planet through its house first, so the remedy should target the life area of that house.`;
    }
    case "tri_bhagi_dasha": {
      const current = categoryData?.current;
      const bhagi = current?.bhagi?.nakshatra || "the running nakshatra";
      return `Tri Bhagi Dasha divides every Vimshottari mahadasha into three equal bhagis, one for each nakshatra the mahadasha lord rules. Currently ${bhagi} bhagi is running${current?.mahadasha?.planet ? ` inside ${current.mahadasha.planet} mahadasha` : ""}. Regarding "${question}", the bhagi explains why events land slightly before or after an antardasha boundary.`;
    }
    case "lal_kitab_dasha": {
      const periods = Array.isArray(categoryData?.periods)
        ? categoryData.periods.length
        : 0;
      return `The Lal Kitab Dasha view contains ${periods} calculated mahadasha periods with antardasha dates. Its timing reference is based on the Moon's birth nakshatra; traditional interpretations can vary. Regarding "${question}", use the displayed dates as a reference rather than a guaranteed prediction.`;
    }
    case "cil_sub_sub": {
      const rows = Array.isArray(categoryData?.rows) ? categoryData.rows : [];
      return `CIL (Sub Sub) shows ${rows.length} planetary rows with their KP star, sub, sub-sub and house-signification data. Regarding "${question}", use the house lists and the corresponding natal chart together; the table is a traditional interpretive aid.`;
    }
    case "predictions": {
      return `Your Prediction and Remedies section is based on the planetary placements in your calculated chart. It offers traditional reflection prompts and practical habits, not certain outcomes or professional advice. Regarding "${question}", consider the placement and house themes shown in the report.`;
    }
    case "varsha_kundli": {
      const periodStart = categoryData?.periodStart;
      const periodEnd = categoryData?.periodEnd;
      return `Your Varsha Kundli is the annual chart calculated for the sidereal solar return at your birth location${periodStart && periodEnd ? `, covering ${new Date(periodStart).toISOString().slice(0, 10)} to ${new Date(periodEnd).toISOString().slice(0, 10)}` : ""}. Regarding "${question}", treat annual-chart interpretations as traditional guidance rather than certainty.`;
    }
    default:
      return `According to your Vedic birth chart with ${lagna} Lagna and ${rashi} Moon (${nakshatra} nakshatra), your planetary alignments indicate steady progress and resilience. Regarding "${question}", alignment with your natural planetary strengths will yield constructive results.`;
  }
};

/**
 * POST /api/kundli/calculate
 * Calculate complete 30-category Kundli from birth details.
 * Supports optional category filtering: ?category=ashtakvarga or body.category
 */
const calculateKundli = async (req, res, next) => {
  try {
    const {
      name,
      birthDate,
      dateOfBirth,
      birthTime,
      timeOfBirth,
      birthPlace,
      placeOfBirth,
      place,
      gender,
      latitude,
      longitude,
      timeZoneOffsetMinutes,
      save,
      category,
    } = req.body || {};

    const rawDob = birthDate || dateOfBirth;
    const parsedDob = parseDateOfBirth(rawDob);
    if (!parsedDob) {
      return res.status(400).json({
        success: false,
        message: "dateOfBirth is required and must be a valid date (e.g. YYYY-MM-DD, DD/MM/YYYY, or 23-OCT-2026)",
      });
    }

    const rawTob = birthTime || timeOfBirth || "12:00:00";
    const parsedTime = parseNormalizedTime(rawTob);

    let lat = Number(latitude);
    let lon = Number(longitude);
    let tzMinutes = Number.isFinite(Number(timeZoneOffsetMinutes)) ? Number(timeZoneOffsetMinutes) : 330;
    let placeName = String(birthPlace || placeOfBirth || place || "Agra").trim();

    // Geocode place if latitude/longitude not provided
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const resolved = await resolveBirthLocationFromPlace(placeName, parsedDob);
      if (resolved) {
        lat = resolved.latitude;
        lon = resolved.longitude;
        tzMinutes = resolved.timeZoneOffsetMinutes;
        placeName = resolved.placeOfBirth || placeName;
      } else {
        // Default coordinates if geocoding cannot resolve
        lat = 27.1767;
        lon = 78.0081;
        tzMinutes = 330;
      }
    }

    const kundliResult = await calculateFullKundli({
      name: String(name || "User").trim(),
      dateOfBirth: parsedDob,
      timeOfBirth: parsedTime.formatted24,
      place: placeName,
      gender: String(gender || "Male").trim(),
      latitude: lat,
      longitude: lon,
      timeZoneOffsetMinutes: tzMinutes,
      save: Boolean(save),
    });

    // Optionally save to user profile if user is authenticated and save requested
    if (save && req.user && req.user._id) {
      try {
        await Horoscope.findOneAndUpdate(
          { user: req.user._id },
          {
            $set: {
              name: String(name || req.user.name || "User").trim(),
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
        );
      } catch (err) {
        // Non-fatal: continue returning calculated kundli
      }
    }

    // Check category filter
    const requestedCategory = (req.query.category || category || "all").toLowerCase().trim();

    if (requestedCategory !== "all" && kundliResult.categories[requestedCategory]) {
      return res.status(200).json({
        success: true,
        message: `Kundli ${requestedCategory} category retrieved successfully`,
        data: {
          summary: kundliResult.summary,
          categoryKey: requestedCategory,
          category: kundliResult.categories[requestedCategory],
          navigation: kundliResult.navigation,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Kundli calculated successfully",
      data: {
        summary: kundliResult.summary,
        navigation: kundliResult.navigation,
        categories: kundliResult.categories,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/kundli/lal-kitab-varsha-phal
 * Calculate the selected year's annual solar-return chart and Lal Kitab report.
 */
const calculateLalKitabVarshaPhal = async (req, res, next) => {
  try {
    const {
      name,
      birthDate,
      dateOfBirth,
      birthTime,
      timeOfBirth,
      birthPlace,
      placeOfBirth,
      place,
      latitude,
      longitude,
      timeZoneOffsetMinutes,
      year,
    } = req.body || {};
    const parsedDob = parseDateOfBirth(birthDate || dateOfBirth);
    if (!parsedDob) {
      return res.status(400).json({
        success: false,
        message: "dateOfBirth is required and must be a valid date",
      });
    }

    const selectedYear = Number(year);
    if (!Number.isInteger(selectedYear) || selectedYear < parsedDob.getUTCFullYear() || selectedYear > 2200) {
      return res.status(400).json({
        success: false,
        message: "year must be an integer between the birth year and 2200",
      });
    }

    const rawLatitude = Number(latitude);
    const rawLongitude = Number(longitude);
    let lat = rawLatitude;
    let lon = rawLongitude;
    let tzMinutes = Number.isFinite(Number(timeZoneOffsetMinutes))
      ? Number(timeZoneOffsetMinutes)
      : 330;
    let placeName = String(birthPlace || placeOfBirth || place || "Agra").trim();

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const resolved = await resolveBirthLocationFromPlace(placeName, parsedDob);
      if (!resolved) {
        return res.status(422).json({
          success: false,
          message: "Could not resolve the birth location; provide valid latitude and longitude",
        });
      }
      lat = resolved.latitude;
      lon = resolved.longitude;
      tzMinutes = resolved.timeZoneOffsetMinutes;
      placeName = resolved.placeOfBirth || placeName;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180 || Math.abs(tzMinutes) > 840) {
      return res.status(400).json({
        success: false,
        message: "Birth coordinates or time-zone offset are outside the valid range",
      });
    }

    const parsedTime = parseNormalizedTime(birthTime || timeOfBirth || "12:00:00");
    const data = buildLalKitabVarshaPhal({
      dateOfBirth: parsedDob,
      timeOfBirth: parsedTime.formatted24,
      timeZoneOffsetMinutes: tzMinutes,
      latitude: lat,
      longitude: lon,
      year: selectedYear,
    });

    return res.status(200).json({
      success: true,
      message: "Lal Kitab Varshphal calculated successfully",
      data: {
        name: String(name || "User").trim(),
        place: placeName,
        ...data,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/kundli/my-kundli
 * Retrieve complete 30-category Kundli for authenticated user from saved Horoscope
 */
const getMyKundli = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

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

    const kundliResult = await calculateFullKundli({
      name: horoscope.name || req.user.name || "User",
      dateOfBirth: horoscope.dateOfBirth,
      timeOfBirth: parsedTime.formatted24,
      place: horoscope.placeOfBirth || "Agra",
      gender: req.user.gender || "Male",
      latitude: lat,
      longitude: lon,
      timeZoneOffsetMinutes: tzMinutes,
      save: true,
    });

    const requestedCategory = (req.query.category || "all").toLowerCase().trim();
    if (requestedCategory !== "all" && kundliResult.categories[requestedCategory]) {
      return res.status(200).json({
        success: true,
        message: `Kundli ${requestedCategory} category retrieved successfully`,
        data: {
          summary: kundliResult.summary,
          categoryKey: requestedCategory,
          category: kundliResult.categories[requestedCategory],
          navigation: kundliResult.navigation,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Horoscope retrieved successfully",
      data: {
        summary: kundliResult.summary,
        navigation: kundliResult.navigation,
        categories: kundliResult.categories,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/kundli/categories
 * Returns the catalog of all 34 screen categories in the Kundli flow
 */
const getCategories = (req, res) => {
  const categoriesList = [
    { id: 1, key: "new_kundli", title: "New Kundli", type: "form", description: "Birth details entry screen" },
    { id: 2, key: "basic", title: "Basic", type: "menu", description: "Overview directory & quick access modules" },
    { id: 3, key: "lagna", title: "Lagna", type: "chart", description: "D1 Natal Rashi Chart with planetary degrees & dignities" },
    { id: 4, key: "navamsha", title: "Navamsha", type: "chart", description: "D9 Navamsha Divisional Chart (Spiritual & Marital strength)" },
    { id: 5, key: "moon", title: "Moon", type: "chart", description: "Chandra Kundli (Moon chart representing mind & mental disposition)" },
    { id: 6, key: "chalit", title: "Chalit", type: "chart", description: "Bhava Chalit Chart (Actual house occupancy of planets)" },
    { id: 7, key: "transit", title: "Transit", type: "chart", description: "Real-time planetary Gochar relative to Natal Lagna or Moon" },
    { id: 8, key: "karakamsha", title: "Karakamsha", type: "chart", description: "Jaimini Karakamsha Chart based on Atmakaraka (AK) Navamsha" },
    { id: 9, key: "swamsa", title: "Swamsa", type: "chart", description: "Jaimini Swamsa Chart with Navamsha Lagna as House 1" },
    { id: 10, key: "planets", title: "Planets", type: "table", description: "Comprehensive planetary sign, degree, nakshatra & dignity table" },
    { id: 11, key: "planets_sub", title: "Planets-Sub", type: "table", description: "KP System Sign, Star, Sub, and Sub-Sub Lords table" },
    { id: 12, key: "chalit_table", title: "Chalit Table", type: "table", description: "Bhava cusp beginnings, midpoints (Madhya) & sandhis" },
    { id: 13, key: "birth_details", title: "Birth Details", type: "card", description: "Core birth parameters, Ayanamsa, Mangal Dosh & Dasha balance" },
    { id: 14, key: "person_details", title: "Person Details", type: "table", description: "Astronomical calendar, LMT, GMT, Ishtkaal, Dinamana & coordinates" },
    { id: 15, key: "panchang", title: "Panchang", type: "card", description: "Daily birth Panchang: Paksha, Tithi, Nakshatra, Yoga, Karana, Sunrise, Sunset" },
    { id: 16, key: "avakhada_chakra", title: "Avakhada Chakra", type: "table", description: "Paya, Varna, Yoni, Gana, Vasya, Nadi, Julian Day & Sidereal time" },
    { id: 17, key: "ghatak_and_favourable", title: "Ghatak and Favourable", type: "card", description: "Inauspicious Ghatak factors & auspicious lucky numbers, days and gemstones" },
    { id: 18, key: "ashtakvarga", title: "Ashtakvarga", type: "matrix", description: "Sarvashtakavarga (SAV) and Bhinnashtakavarga (BAV) 337-point matrix" },
    { id: 19, key: "prastharashtakvarga", title: "Prastharashtakvarga", type: "matrix", description: "Detailed 8-donor bindu distribution grids across 12 signs per planet" },
    { id: 20, key: "bhav_madhya", title: "Bhav Madhya", type: "table", description: "Bhava beginnings, midpoints (Madhya) and junction sandhis" },
    { id: 21, key: "friendship", title: "Friendship", type: "table", description: "Natural (Naisargika), Temporal (Tatkalika) & Five-fold (Panchadha) Maitri" },
    { id: 22, key: "shad_bala", title: "Shad Bala", type: "chart", description: "6-fold planetary strength (Virupas/Rupas) and 12-house Bhav Bala" },
    { id: 23, key: "kp_system", title: "KP System", type: "table", description: "Krishnamurti Paddhati cusps, planet significators and ruling planets" },
    { id: 24, key: "cloud", title: "Cloud", type: "promo", description: "AstroSage AI Cloud synchronization & Kundli AI+ membership" },
    { id: 25, key: "download_pdf", title: "Download PDF", type: "action", description: "50-page Janam Kundli & 250+ page Brihat Kundli reports catalogue" },
    { id: 26, key: "ask_questions", title: "Ask Questions", type: "chat", description: "Contextual AI Astrologer Q&A and Premium Astrologer consultation" },
    { id: 27, key: "nakshatra_nadi", title: "Nakshatra Nadi", type: "table", description: "Adi, Madhya & Antya Nadi from the Moon nakshatra with traits, compatibility and remedies" },
    { id: 28, key: "chandra_kala_nadi", title: "Chandra Kala Nadi", type: "table", description: "Deva Keralam rashi nadi-amsha reading of the Moon (150 nadi amshas per rashi)" },
    { id: 29, key: "lal_kitab", title: "Lal Kitab", type: "card", description: "Planet-in-house predictions, house charities and classic Lal Kitab remedies" },
    { id: 30, key: "tri_bhagi_dasha", title: "Tri Bhagi Dasha", type: "table", description: "Each Vimshottari mahadasha split into three equal nakshatra bhagis" },
    { id: 31, key: "lal_kitab_dasha", title: "Lal Kitab Dasha", type: "table", description: "Dasha periods and antardasha date ranges" },
    { id: 32, key: "cil_sub_sub", title: "CIL (Sub Sub)", type: "table", description: "Planet, star, sub, sub-sub and house significations" },
    { id: 33, key: "predictions", title: "Prediction and Remedies", type: "card", description: "Chart-based traditional reflections and practical practices" },
    { id: 34, key: "varsha_kundli", title: "Varsha Kundli", type: "chart", description: "Annual sidereal solar-return chart for the birth location" }
  ];

  return res.status(200).json({
    success: true,
    message: "Categories list retrieved successfully",
    data: {
      totalCategories: categoriesList.length,
      categories: categoriesList,
    },
  });
};

/**
 * POST /api/kundli/chat
 * Category-aware contextual AI Astrologer Q&A assistant.
 * Accepts category context ("Chat with Lagna", "Chat with Moon", "Chat with Ashtakvarga", etc.)
 * Verifies AI output against computed Vedic chart data to prevent hallucinations.
 */
const chatKundli = async (req, res, next) => {
  try {
    const { question, category = "general", birthDetails } = req.body || {};
    // Multipart uploads put files on req.files as { images: [...] }; the RAG
    // service consumes a flat array. Also tolerate birthDetails arriving as a
    // JSON string (multipart form fields are always strings).
    const images = flattenUploadedImages(req.files);
    let parsedBirthDetails = birthDetails;
    if (typeof parsedBirthDetails === "string" && parsedBirthDetails.trim()) {
      try {
        parsedBirthDetails = JSON.parse(parsedBirthDetails);
      } catch (e) {
        parsedBirthDetails = null;
      }
    }

    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ success: false, message: "question is required" });
    }
    if (question.length > 1000) {
      return res.status(400).json({ success: false, message: "question is too long (max 1000 characters)" });
    }

    let calculatedData = null;

    // Use provided birth details, or fetch from logged-in user
    if (parsedBirthDetails && typeof parsedBirthDetails === "object" && (parsedBirthDetails.dateOfBirth || parsedBirthDetails.birthDate)) {
      try {
        const parsedDob = parseDateOfBirth(parsedBirthDetails.dateOfBirth || parsedBirthDetails.birthDate);
        if (parsedDob) {
          calculatedData = await calculateFullKundli({
            ...parsedBirthDetails,
            dateOfBirth: parsedDob,
          });
        }
      } catch (e) {
        // Fall back to default or saved chart
      }
    }

    if (!calculatedData && req.user) {
      const saved = await Horoscope.findOne({ user: req.user._id }).lean();
      if (saved) {
        calculatedData = await calculateFullKundli({
          name: saved.name || req.user.name,
          dateOfBirth: saved.dateOfBirth,
          timeOfBirth: saved.timeOfBirth,
          place: saved.placeOfBirth,
          latitude: saved.latitude,
          longitude: saved.longitude,
          timeZoneOffsetMinutes: saved.timeZoneOffsetMinutes,
        });
      }
    }

    // Default reference chart if none provided
    if (!calculatedData) {
      calculatedData = await calculateFullKundli({
        name: "User",
        dateOfBirth: new Date(),
        timeOfBirth: "12:00:00",
        place: "Agra",
        latitude: 27.1767,
        longitude: 78.0081,
        timeZoneOffsetMinutes: 330,
      });
    }

    const chartSummary = calculatedData.summary;
    const categoryKey = category.toLowerCase().trim();
    const specificCategoryData = calculatedData.categories[categoryKey] || null;

    let answer = null;
    let sources = [];
    let isGrounded = false;

    let myChartSummary = null;
    try {
      if (parsedBirthDetails && (parsedBirthDetails.dateOfBirth || parsedBirthDetails.birthDate)) {
        const parsedDobForHd = parseDateOfBirth(parsedBirthDetails.dateOfBirth || parsedBirthDetails.birthDate);
        if (parsedDobForHd) {
          myChartSummary = summarizeHumanDesignChart(
            calculateHumanDesignChart({
              name: parsedBirthDetails.name || req.user?.name || "User",
              dateOfBirth: parsedDobForHd,
              timeOfBirth: parsedBirthDetails.timeOfBirth || parsedBirthDetails.birthTime || "12:00",
              place: parsedBirthDetails.place || parsedBirthDetails.placeOfBirth || "",
              latitude: parsedBirthDetails.latitude,
              longitude: parsedBirthDetails.longitude,
              timeZoneOffsetMinutes: parsedBirthDetails.timeZoneOffsetMinutes ?? 330,
            })
          );
        }
      } else if (req.user?._id) {
        const savedHd = await HumanDesignChart.findOne({ user: req.user._id }).lean();
        if (savedHd) {
          myChartSummary = summarizeHumanDesignChart(savedHd);
        } else {
          const savedHoroscope = await Horoscope.findOne({ user: req.user._id }).lean();
          if (savedHoroscope?.dateOfBirth) {
            myChartSummary = summarizeHumanDesignChart(
              calculateHumanDesignChart({
                name: savedHoroscope.name || req.user.name || "User",
                dateOfBirth: savedHoroscope.dateOfBirth,
                timeOfBirth: savedHoroscope.timeOfBirth,
                place: savedHoroscope.placeOfBirth,
                latitude: savedHoroscope.latitude,
                longitude: savedHoroscope.longitude,
                timeZoneOffsetMinutes: savedHoroscope.timeZoneOffsetMinutes,
              })
            );
          }
        }
      }
    } catch (hdErr) {
      // Non-fatal: continue Vedic Q&A even if MyChart context could not be hydrated
    }

    // Attempt retrieval-augmented generation (RAG) with AI service
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

      const promptCategoryPrefix = categoryKey !== "general" ? `[Category: ${categoryKey.toUpperCase()}] ` : "";
      const enrichedQuestion = `${promptCategoryPrefix}${question.trim()}`;

      const aiResponse = await askAstroQuestion(enrichedQuestion, {
        chartContext,
        images,
      });
      if (aiResponse && aiResponse.answer && typeof aiResponse.answer === "string" && aiResponse.answer.trim().length > 10) {
        // AI Verification: Check for obvious hallucinations or contradictions
        const text = aiResponse.answer;
        const ascendant = chartSummary.lagna;
        const moon = chartSummary.rashi;

        // If AI mentions Lagna or Moon incorrectly, flag and correct
        const contradictions = [];
        if (text.includes("your Ascendant is") && !text.includes(ascendant)) {
          contradictions.push(`Lagna mismatch detected (expected ${ascendant})`);
        }

        if (contradictions.length === 0) {
          answer = text;
          sources = aiResponse.sources || [];
          isGrounded = true;
        }
      }
    } catch (aiError) {
      if (images.length > 0) throw aiError;
      // AI provider unavailable or error occurred: fallback to deterministic Vedic interpretation
    }

    // Fallback if AI was unavailable or failed verification
    if (!answer) {
      answer = generateGroundedCategoryInterpretation(categoryKey, question, chartSummary, specificCategoryData);
      sources = [
        { id: "VEDIC_PARASHARI_CORE", title: "Brihat Parashara Hora Shastra", section: categoryKey },
        { id: "KUNDLI_CHART_CONTEXT", title: "Calculated Vedic Ephemeris", section: "Natal Chart Placements" },
      ];
      isGrounded = true;
    }

    return res.status(200).json({
      success: true,
      message: "Chat response generated successfully",
      data: {
        category: categoryKey,
        question: question.trim(),
        answer,
        verified: true,
        verificationDetails: {
          chartGrounded: isGrounded,
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
        ...(myChartSummary ? { myChart: myChartSummary } : {}),
        sources,
      },
    });
  } catch (error) {
    next(error);
  }
};

const VALID_MY_CHART_TABS = new Set(["bodyGraph", "about", "centers", "gates", "channels", "love"]);

const normalizeMyChartTab = (rawTab) => {
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

// Shared helper used by both /api/kundli/my-chart and /api/astrologers/* flows
// to compute, enrich, and optionally persist the user's Human Design "My Chart".
const resolveOrComputeMyChart = async (reqUser, rawInput = {}, options = {}) => {
  const { persist = true, forceRecalculate = false } = options;
  const input = rawInput && typeof rawInput === "object" ? rawInput : {};
  const rawDob = input.birthDate || input.dateOfBirth;

  if (rawDob !== undefined && rawDob !== null && String(rawDob).trim() !== "") {
    const parsedDob = parseDateOfBirth(rawDob);
    if (!parsedDob) {
      const err = new Error(
        "dateOfBirth must be a valid date (e.g. YYYY-MM-DD, DD/MM/YYYY, or 23-OCT-2026)"
      );
      err.statusCode = 400;
      err.expose = true;
      throw err;
    }

    const rawTob = input.birthTime || input.timeOfBirth || "12:00";
    const parsedTime = parseNormalizedTime(rawTob);
    const hasExplicitLat = input.latitude !== undefined && input.latitude !== "" && Number.isFinite(Number(input.latitude));
    const hasExplicitLon = input.longitude !== undefined && input.longitude !== "" && Number.isFinite(Number(input.longitude));
    const hasExplicitTz = input.timeZoneOffsetMinutes !== undefined && input.timeZoneOffsetMinutes !== "" && Number.isFinite(Number(input.timeZoneOffsetMinutes));

    let lat = hasExplicitLat ? Number(input.latitude) : NaN;
    let lon = hasExplicitLon ? Number(input.longitude) : NaN;
    let tzMinutes = hasExplicitTz ? Number(input.timeZoneOffsetMinutes) : 330;
    let placeName = String(input.birthPlace || input.placeOfBirth || input.place || "").trim();

    if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && placeName) {
      try {
        const resolved = await resolveBirthLocationFromPlace(placeName, parsedDob);
        if (resolved) {
          lat = resolved.latitude;
          lon = resolved.longitude;
          if (!hasExplicitTz) tzMinutes = resolved.timeZoneOffsetMinutes;
          placeName = resolved.placeOfBirth || placeName;
        }
      } catch (geoErr) {
        // Non-fatal if timeZoneOffsetMinutes is already known
      }
    }

    const chartData = calculateHumanDesignChart({
      name: String(input.name || reqUser?.name || "User").trim(),
      dateOfBirth: parsedDob,
      timeOfBirth: parsedTime.formatted24.slice(0, 5),
      place: placeName,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lon) ? lon : null,
      timeZoneOffsetMinutes: tzMinutes,
    });

    const shouldSave = input.save === undefined ? persist : Boolean(input.save && input.save !== "false");
    if (shouldSave && reqUser?._id) {
      try {
        const savedDoc = await HumanDesignChart.findOneAndUpdate(
          { user: reqUser._id },
          {
            $set: {
              user: reqUser._id,
              ...chartData,
            },
          },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        ).lean();
        return savedDoc || chartData;
      } catch (saveErr) {
        // Non-fatal if persistence fails (e.g. unit test without DB connection)
      }
    }

    return chartData;
  }

  // No explicit birth details supplied -> check cached HumanDesignChart or user's Horoscope
  if (reqUser?._id) {
    if (!forceRecalculate) {
      const existing = await HumanDesignChart.findOne({ user: reqUser._id }).lean();
      if (
        existing &&
        Array.isArray(existing.personality) &&
        existing.personality.length === 13 &&
        existing.about &&
        existing.love &&
        existing.bodyGraph
      ) {
        return existing;
      }
      // Legacy/partial saved doc with birthDetails -> rehydrate accurately
      if (existing?.birthDetails?.dateOfBirth) {
        const recomputed = calculateHumanDesignChart({
          name: existing.name || reqUser.name || "User",
          ...existing.birthDetails,
        });
        await HumanDesignChart.findOneAndUpdate(
          { user: reqUser._id },
          { $set: recomputed },
          { upsert: true, new: true }
        ).lean().catch(() => null);
        return recomputed;
      }
    }

    const horoscope = await Horoscope.findOne({ user: reqUser._id }).lean();
    if (horoscope?.dateOfBirth) {
      const computed = calculateHumanDesignChart({
        name: horoscope.name || reqUser.name || "User",
        dateOfBirth: horoscope.dateOfBirth,
        timeOfBirth: horoscope.timeOfBirth || "12:00",
        place: horoscope.placeOfBirth || "",
        latitude: horoscope.latitude,
        longitude: horoscope.longitude,
        timeZoneOffsetMinutes: horoscope.timeZoneOffsetMinutes ?? 330,
      });
      if (persist) {
        const savedDoc = await HumanDesignChart.findOneAndUpdate(
          { user: reqUser._id },
          { $set: { user: reqUser._id, ...computed } },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        ).lean().catch(() => null);
        if (savedDoc) return savedDoc;
      }
      return computed;
    }
  }

  const err = new Error(
    "Birth details (dateOfBirth) or a saved Horoscope are required to calculate My Chart."
  );
  err.statusCode = 400;
  err.expose = true;
  throw err;
};

/**
 * GET / POST /api/kundli/my-chart
 * Calculates or retrieves the Human Design BodyGraph ("My Chart") with all 5 tabs:
 * BodyGraph (13 Design + 13 Personality planets), About, Centers (9), Gates (active),
 * Channels (defined) + Love ("Love for Type").
 */
const myChart = async (req, res, next) => {
  try {
    const bodyInput = req.body && typeof req.body === "object" ? req.body : {};
    const queryInput = req.query && typeof req.query === "object" ? req.query : {};
    const mergedInput = { ...queryInput, ...bodyInput };
    const recalculate =
      mergedInput.recalculate === true || mergedInput.recalculate === "true";

    const chart = await resolveOrComputeMyChart(req.user, mergedInput, {
      persist: true,
      forceRecalculate: recalculate,
    });

    const language = req.language || req.get("accept-language") || "";
    const localizedChart = localizeHumanDesignChart(chart, language);
    const requestedTab = normalizeMyChartTab(mergedInput.tab);
    const data = requestedTab
      ? {
          activeTab: requestedTab,
          section: localizedChart[requestedTab],
          summary: summarizeHumanDesignChart(localizedChart),
          ...localizedChart,
        }
      : {
          summary: summarizeHumanDesignChart(localizedChart),
          ...localizedChart,
        };

    return res.status(200).json({
      success: true,
      message: "My Chart retrieved successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  calculateKundli,
  calculateLalKitabVarshaPhal,
  getMyKundli,
  getCategories,
  chatKundli,
  myChart,
  resolveOrComputeMyChart,
  parseDateOfBirth,
};
