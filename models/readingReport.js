const mongoose = require("mongoose");

// One saved Face Reading or Palm Reading report.
// The uploaded image is stored separately (see readingMediaService) so that a
// report can be deleted without leaving the photo behind (privacy requirement).
const pointSchema = new mongoose.Schema(
  {
    // Stable area id from the AI prompt (e.g. `heartLine`). Keeping it makes
    // the report usable even when the localized title changes.
    key: { type: String, default: "" },
    title: { type: String, default: "" },
    detail: { type: String, default: "" },
    observation: { type: String, default: "" },
    interpretation: { type: String, default: "" },
  },
  { _id: false }
);

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
    provider: { type: String, enum: ["cloudinary", "local"], default: "local" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: null },
  },
  { _id: false }
);

const readingReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    feature: {
      type: String,
      enum: ["face", "palm", "graphology", "drawing"],
      required: true,
    },
    tier: { type: String, enum: ["basic", "detailed"], default: "basic" },
    images: { type: [imageSchema], default: [] },
    notes: { type: String, default: "" },
    focus: { type: String, default: "" },
    language: { type: String, default: "en-US" },

    report: {
      summary: { type: String, default: "" },
      overallReading: { type: String, default: "" },
      features: { type: [pointSchema], default: [] },
      strengths: { type: [String], default: [] },
      cautions: { type: [String], default: [] },
      suggestions: { type: [String], default: [] },
      detailed: { type: mongoose.Schema.Types.Mixed, default: {} },
      disclaimer: { type: String, default: "" },
      rawText: { type: String, default: "" },
    },

    // Result of the lightweight pre-flight image check.
    quality: {
      valid: { type: Boolean, default: true },
      message: { type: String, default: "" },
    },

    // Explicit consent is required before any face/palm photo is processed.
    consent: {
      acceptedAt: { type: Date, required: true },
      version: { type: String, default: "1.0" },
      imageDeletionRequested: { type: Boolean, default: false },
    },

    billing: {
      isFree: { type: Boolean, default: true },
      charged: { type: Number, default: 0 },
      price: { type: Number, default: 0 },
      freeRemaining: { type: Number, default: 0 },
      walletBalance: { type: Number, default: null },
    },
  },
  { timestamps: true }
);

readingReportSchema.index({ user: 1, createdAt: -1 });
readingReportSchema.index({ feature: 1, createdAt: -1 });
readingReportSchema.index({ user: 1, feature: 1, createdAt: -1 });

module.exports = mongoose.model("ReadingReport", readingReportSchema);
