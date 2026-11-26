const mongoose = require("mongoose");
const ReadingReport = require("../models/readingReport");
const {
  analyzeReading,
  validateReadingImage,
} = require("../services/readingVisionService");
const {
  persistReadingImages,
  deleteReadingMedia,
} = require("../services/readingMediaService");
const { buildReadingReportPdf } = require("../services/readingReportPdf");
const { flattenReadingImages } = require("../middlewares/readingUpload");
const { normalizeFocusText } = require("../services/focusOptions");
const {
  getCautionPrefix,
  getMessage,
} = require("../services/readingLocalizationService");

const cleanField = (value, maxLength) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const hasConsent = (value) => value === true || value === "true" || value === "1";

const buildError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
};

const findOwnedReport = async (id, userId, feature) => {
  if (!mongoose.isValidObjectId(id)) throw buildError("Invalid report ID.", 400);
  const filter = { _id: id, user: userId };
  if (feature) filter.feature = feature;
  const report = await ReadingReport.findOne(filter);
  if (!report) throw buildError("Report not found.", 404);
  return report;
};

const titleCase = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const slug = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const featureMessageKey = (prefix, feature) => {
  const suffix = {
    face: "Face",
    palm: "Palm",
    graphology: "Graphology",
    drawing: "Drawing",
  }[feature];
  return `${prefix}${suffix}`;
};

// The Flutter client parses one common FacePalmReading model for both
// features. Returning both the canonical (feature/tier/report) and the flat
// app-facing (type/summary/features/...) fields keeps a single source of truth
// without forcing the app to know which endpoint it called.
const serialize = (doc) => {
  const value = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const report = value.report || {};
  const detailed = report.detailed || {};
  const language = value.language || (report.language ?? "en-US");
  const cautionPrefix = getCautionPrefix(language);

  const features = (Array.isArray(report.features) ? report.features : []).map(
    (item) => {
      const point = item && typeof item.toObject === "function" ? item.toObject() : item || {};
      const label = point.title || point.label || point.key || "Observation";
      return {
        // Stable area id when available: Devanagari labels would slug to an
        // empty string otherwise.
        key: point.key ? slug(point.key) : slug(label),
        label,
        observation: point.observation || "",
        interpretation: point.interpretation || point.detail || "",
        strength: point.strength || "moderate",
      };
    }
  );

  const proportions = Object.entries(detailed)
    .map(([key, entry]) => {
      const item = entry && typeof entry.toObject === "function" ? entry.toObject() : entry || {};
      return {
        key: slug(key),
        label: item.label || titleCase(key),
        value: item.observation || "",
        detail: item.interpretation || "",
      };
    })
    .filter((item) => item.value || item.detail);

  const cautions = Array.isArray(report.cautions)
    ? report.cautions.map((item) =>
        typeof item === "string" ? item : item?.detail || item?.title || ""
      )
    : [];

  return {
    id: value._id,
    // Canonical fields (used by admin and the per-feature endpoints).
    feature: value.feature,
    tier: value.tier,
    images: value.images || [],
    notes: value.notes || "",
    focus: value.focus || "",
    report,
    billing: value.billing || {},
    consent: value.consent || {},
    createdAt: value.createdAt,
    // Flat fields consumed by the app's shared FacePalmReading parser.
    type: value.feature,
    image: (value.images || [])[0] || null,
    quality: value.quality || { valid: true, message: "" },
    verdict: report.summary || "",
    summary: report.summary || "",
    interpretation: report.overallReading || "",
    features,
    proportions,
    strengths: Array.isArray(report.strengths) ? report.strengths : [],
    suggestions: [
      ...(Array.isArray(report.suggestions) ? report.suggestions : []),
      ...cautions.filter(Boolean).map((item) => `${cautionPrefix}${item}`),
    ],
    disclaimer: report.disclaimer || "",
  };
};

const createReadingController = (feature) => {
  // GET /api/<feature>/billing
  // Kept for older app builds; Face/Palm readings are free, so there is no
  // quota or wallet balance to report any more.
  const billing = async (req, res) =>
    res.json({
      success: true,
      data: {
        feature,
        freeUsed: 0,
        freeLimit: 0,
        freeRemaining: 0,
        walletBalance: 0,
        basicPrice: 0,
        detailedPrice: 0,
        canUseFree: true,
        isFree: true,
      },
    });

  // POST /api/<feature>/analyze  (multipart/form-data)
  const analyze = async (req, res, next) => {
    let storedImages = [];
    try {
      const files = flattenReadingImages(req.files);
      if (!files.length) {
        return res.status(400).json({
          success: false,
          message: getMessage(featureMessageKey("uploadRequired", feature), req.language),
        });
      }
      if (!hasConsent(req.body?.consent)) {
        return res.status(400).json({
          success: false,
          message: getMessage("consentRequired", req.language),
          code: "CONSENT_REQUIRED",
        });
      }

      // Reject unusable photos before spending an AI call.
      const checks = files.map((file) => validateReadingImage(file, req.language));
      const quality = checks.find((item) => !item.valid) || {
        valid: true,
        message: "",
      };
      if (!quality.valid) {
        return res.status(400).json({
          success: false,
          message: quality.message,
          code: "INVALID_IMAGE",
        });
      }

      // Graphology and Drawing use a single basic report; other readings may
      // request detail.
      const tier =
        feature === "graphology" || feature === "drawing"
          ? "basic"
          : req.body?.tier === "detailed"
            ? "detailed"
            : "basic";

      // The app sends a stable focus slug; expand it before it reaches the
      // prompt and the stored report. Older free-text clients keep working.
      // Keep `notes` and `focus` distinct: when both are supplied the AI must
      // see both, instead of silently dropping the selected focus.
      const notes = normalizeFocusText(req.body?.notes, 1000);
      const focus = normalizeFocusText(req.body?.focus, 300);

      const result = await analyzeReading({
        feature,
        images: files,
        tier,
        notes,
        focus,
        language: req.language,
      });

      storedImages = await persistReadingImages(files, req.user._id, feature);

      const doc = await ReadingReport.create({
        user: req.user._id,
        feature,
        tier,
        images: storedImages,
        // `notes` mirrors the older single-field contract so clients that only
        // ever sent one field still see their text in the saved report.
        notes: notes || focus,
        focus,
        language: req.language || "en-US",
        report: result,
        quality,
        consent: {
          acceptedAt: new Date(),
          version: cleanField(req.body?.consentVersion, 20) || "1.0",
        },
        billing: { isFree: true, charged: 0, price: 0 },
      });

      return res.status(201).json({
        success: true,
        message: getMessage(featureMessageKey("reportReady", feature), req.language),
        data: { ...serialize(doc), billing: doc.billing },
      });
    } catch (error) {
      await Promise.all(
        storedImages.map((image) => deleteReadingMedia(image).catch(() => false))
      );
      return next(error);
    }
  };

  // GET /api/<feature>/reports
  const listReports = async (req, res, next) => {
    try {
      const limit = Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
        50
      );
      const reports = await ReadingReport.find({ user: req.user._id, feature })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      return res.json({
        success: true,
        data: reports.map(serialize),
        pagination: { limit, hasMore: reports.length === limit },
      });
    } catch (error) {
      return next(error);
    }
  };

  // GET /api/<feature>/reports/:id
  const getReport = async (req, res, next) => {
    try {
      const report = await findOwnedReport(req.params.id, req.user._id, feature);
      return res.json({ success: true, data: serialize(report) });
    } catch (error) {
      return next(error);
    }
  };

  // GET /api/<feature>/reports/:id/pdf
  const downloadPdf = async (req, res, next) => {
    try {
      const report = await findOwnedReport(req.params.id, req.user._id, feature);
      const pdf = buildReadingReportPdf({
        report: report.report,
        reading: report,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${feature}-reading-${String(report._id)}.pdf"`
      );
      res.setHeader("Content-Length", String(pdf.length));
      return res.send(pdf);
    } catch (error) {
      return next(error);
    }
  };

  // DELETE /api/<feature>/reports/:id — removes the photo as well as the report
  const deleteReport = async (req, res, next) => {
    try {
      const report = await findOwnedReport(req.params.id, req.user._id, feature);
      await Promise.all(
        (report.images || []).map((image) =>
          deleteReadingMedia(image).catch(() => false)
        )
      );
      await ReadingReport.deleteOne({ _id: report._id });
      return res.json({
        success: true,
        message: getMessage(featureMessageKey("deleted", feature), req.language),
      });
    } catch (error) {
      return next(error);
    }
  };

  return { billing, analyze, listReports, getReport, downloadPdf, deleteReport };
};

// Shared handlers for the unified /api/face-palm router. The app sends a
// `type` field with each request, so a single route can serve both features.
const getAnyReport = async (req, res, next) => {
  try {
    const report = await findOwnedReport(req.params.id, req.user._id);
    return res.json({ success: true, data: serialize(report) });
  } catch (error) {
    return next(error);
  }
};

const downloadAnyReportPdf = async (req, res, next) => {
  try {
    const report = await findOwnedReport(req.params.id, req.user._id);
    const pdf = buildReadingReportPdf({ report: report.report, reading: report });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${report.feature}-reading-${String(report._id)}.pdf"`
    );
    res.setHeader("Content-Length", String(pdf.length));
    return res.send(pdf);
  } catch (error) {
    return next(error);
  }
};

const deleteAnyReport = async (req, res, next) => {
  try {
    const report = await findOwnedReport(req.params.id, req.user._id);
    await Promise.all(
      (report.images || []).map((image) =>
        deleteReadingMedia(image).catch(() => false)
      )
    );
    await ReadingReport.deleteOne({ _id: report._id });
    return res.json({
      success: true,
      message: getMessage(featureMessageKey("deleted", report.feature), req.language),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  faceReadingController: createReadingController("face"),
  palmReadingController: createReadingController("palm"),
  graphologyReadingController: createReadingController("graphology"),
  drawingReadingController: createReadingController("drawing"),
  createReadingController,
  getAnyReport,
  downloadAnyReportPdf,
  deleteAnyReport,
  serializeReadingReport: serialize,
};
