const LogoDesign = require("../models/logoDesign");
const LogoReview = require("../models/logoReview");
const {
  buildLogoDesign,
  normalizeLogoInput,
} = require("../services/logo/logoDesignService");
const { enrichDesign, analyzeLogo } = require("../services/logo/logoAiService");
const { generateLogoImages } = require("../services/logo/logoImageService");

const cleanField = (value, maxLength) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const designPayload = (doc) => ({
  id: doc._id,
  companyName: doc.companyName,
  input: doc.input,
  numbers: doc.numbers,
  ...doc.design,
  createdAt: doc.createdAt,
});

// POST /api/logo/generate
// body: { fullName, companyName, companyType, dateOfBirth, birthTime, location }
const generate = async (req, res, next) => {
  try {
    const parsed = normalizeLogoInput(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    const input = parsed.value;
    // Deterministic design first so the response is never blocked by the LLM;
    // enrichment only rewrites the concept/tagline copy.
    const base = buildLogoDesign(input);
    const enrichedDesign = await enrichDesign(base);
    const design = await generateLogoImages(enrichedDesign, req.user._id);

    const doc = await LogoDesign.create({
      user: req.user._id,
      companyName: input.companyName,
      companyType: input.companyType,
      input: {
        fullName: input.fullName,
        companyName: input.companyName,
        companyType: input.companyType,
        dateOfBirth: input.dateOfBirth,
        birthTime: input.birthTime,
        location: input.location,
      },
      numbers: design.numbers,
      design,
    });

    return res.status(201).json({
      success: true,
      message: "Logo direction generated",
      data: designPayload(doc.toObject()),
    });
  } catch (error) {
    return next(error);
  }
};

// GET /api/logo/latest — most recent design for the signed-in user.
const latest = async (req, res, next) => {
  try {
    const doc = await LogoDesign.findOne({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "No logo generated yet. Create your first logo direction.",
      });
    }
    return res.json({
      success: true,
      message: "Latest logo direction",
      data: designPayload(doc),
    });
  } catch (error) {
    return next(error);
  }
};

// POST /api/logo/analyze
// multipart/form-data: logo (required image), companyName?, notes?
const analyze = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload the logo you want reviewed.",
      });
    }

    const companyName = cleanField(req.body?.companyName, 80);
    const notes = cleanField(req.body?.notes, 1000);
    const report = await analyzeLogo({
      image: req.file,
      companyName,
      notes,
    });

    const doc = await LogoReview.create({
      user: req.user._id,
      companyName,
      notes,
      score: report.score ?? undefined,
      verdict: report.verdict,
      summary: report.summary,
      strengths: report.strengths,
      weaknesses: report.weaknesses,
      suggestions: report.suggestions,
      quickFixes: report.quickFixes,
      disclaimer: report.disclaimer,
      rawText: report.rawText,
    });

    return res.status(201).json({
      success: true,
      message: "Logo review ready",
      data: { id: doc._id, ...report, companyName, createdAt: doc.createdAt },
    });
  } catch (error) {
    return next(error);
  }
};

// GET /api/logo/reviews?limit=20 — previous reviews, newest first.
const listReviews = async (req, res, next) => {
  try {
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
      50,
    );
    const reviews = await LogoReview.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      message: "Logo reviews retrieved",
      data: reviews,
      pagination: { limit, hasMore: reviews.length === limit },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { generate, latest, analyze, listReviews };
