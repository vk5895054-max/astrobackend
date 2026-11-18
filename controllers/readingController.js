const mongoose = require("mongoose");
const ReadingReport = require("../models/readingReport");
const readingBilling = require("../services/readingBillingService");
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

// The Flutter client parses one common FacePalmReading model for both
// features. Returning both the canonical (feature/tier/report) and the flat
// app-facing (type/summary/features/...) fields keeps a single source of truth
// without forcing the app to know which endpoint it called.
const serialize = (doc) => {
  const value = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const report = value.report || {};
  const detailed = report.detailed || {};

  const features = (Array.isArray(report.features) ? report.features : []).map(
    (item) => {
      const point = item && typeof item.toObject === "function" ? item.toObject() : item || {};
      const label = point.title || point.label || point.key || "Observation";
      return {
        key: slug(label),
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
        label: titleCase(key),
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
      ...cautions.filter(Boolean).map((item) => `Keep in mind: ${item}`),
    ],
    disclaimer: report.disclaimer || "",
  };
};

const createReadingController = (feature) => {
  const name = feature === "palm" ? "Palm Reading" : "Face Reading";

  // GET /api/<feature>/billing
  const billing = async (req, res, next) => {
    try {
      const status = await readingBilling.getStatus(req.user._id, feature);
      return res.json({ success: true, data: status });
    } catch (error) {
      return next(error);
    }
  };

  // POST /api/<feature>/analyze  (multipart/form-data)
  const analyze = async (req, res, next) => {
    let consumption = null;
    let storedImages = [];
    try {
      const files = flattenReadingImages(req.files);
      if (!files.length) {
        return res.status(400).json({
          success: false,
          message: `Please upload at least one clear photo for ${name.toLowerCase()}.`,
        });
      }
      if (!hasConsent(req.body?.consent)) {
        return res.status(400).json({
          success: false,
          message: "Please give consent before processing your photo.",
          code: "CONSENT_REQUIRED",
        });
      }

      // Reject unusable photos before charging the user for an AI call.
      const checks = files.map(validateReadingImage);
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

      const tier = req.body?.tier === "detailed" ? "detailed" : "basic";
      const gate = await readingBilling.ensureBillable(req.user._id, feature, tier);
      if (!gate.ok) {
        return res.status(402).json({
          success: false,
          message:
            "Your free readings are finished. Please recharge your wallet to continue.",
          code: "INSUFFICIENT_BALANCE",
          data: {
            freeRemaining: gate.freeRemaining,
            walletBalance: gate.walletBalance,
            price: gate.price,
          },
        });
      }

      consumption = await readingBilling.consume(req.user._id, feature, tier, gate);

      const result = await analyzeReading({
        feature,
        images: files,
        tier,
        notes: cleanField(req.body?.notes, 1000),
        focus: cleanField(req.body?.focus, 300),
        language: req.language,
      });

      storedImages = await persistReadingImages(files, req.user._id, feature);

      const doc = await ReadingReport.create({
        user: req.user._id,
        feature,
        tier,
        images: storedImages,
        notes: cleanField(req.body?.notes, 1000),
        focus: cleanField(req.body?.focus, 300),
        language: req.language || "en-US",
        report: result,
        quality,
        consent: {
          acceptedAt: new Date(),
          version: cleanField(req.body?.consentVersion, 20) || "1.0",
        },
        billing: {
          isFree: consumption.isFree,
          charged: consumption.charged,
          price: gate.price || 0,
          freeRemaining: consumption.freeRemaining,
          walletBalance: consumption.walletBalance,
        },
      });

      return res.status(201).json({
        success: true,
        message: `${name} report ready`,
        data: { ...serialize(doc), billing: doc.billing },
      });
    } catch (error) {
      await Promise.all(
        storedImages.map((image) => deleteReadingMedia(image).catch(() => false))
      );
      if (consumption) {
        await readingBilling.refund(req.user._id, feature, consumption).catch(() => null);
      }
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
        message: `${name} report and photos deleted`,
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
      message:
        report.feature === "palm"
          ? "Palm Reading report and photos deleted"
          : "Face Reading report and photos deleted",
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  faceReadingController: createReadingController("face"),
  palmReadingController: createReadingController("palm"),
  createReadingController,
  getAnyReport,
  downloadAnyReportPdf,
  deleteAnyReport,
  serializeReadingReport: serialize,
};
