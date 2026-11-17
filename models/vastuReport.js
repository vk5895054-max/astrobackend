const mongoose = require("mongoose");
const {
  RULE_CATEGORIES,
  ZONE_KEYS,
  DIRECTIONS,
} = require("../services/vastuRulesEngine");

const findingSchema = new mongoose.Schema(
  {
    rule: { type: mongoose.Schema.Types.ObjectId, ref: "VastuRule", default: null },
    code: { type: String, trim: true, maxlength: 120, default: "" },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    kind: { type: String, enum: ["concern", "strength"], default: "concern" },
    category: { type: String, enum: RULE_CATEGORIES, default: "general" },
    zone: { type: String, trim: true, maxlength: 160, default: "" },
    zoneKey: { type: String, enum: ZONE_KEYS, default: "other" },
    direction: {
      type: String,
      enum: ["", ...DIRECTIONS],
      default: "",
    },
    directionLabel: { type: String, trim: true, maxlength: 60, default: "" },
    concern: {
      type: String,
      enum: ["low", "moderate", "high"],
      default: "moderate",
    },
    concernLabel: { type: String, trim: true, maxlength: 60, default: "" },
    // Kept alongside `concern` because the existing mobile report model reads
    // a "severity" field and maps moderate → medium only by its own fallback.
    severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    explanation: { type: String, trim: true, maxlength: 4000, default: "" },
    remedy: { type: String, trim: true, maxlength: 4000, default: "" },
    source: { type: String, enum: ["rule", "manual"], default: "rule" },
    sourceNote: { type: String, trim: true, maxlength: 500, default: "" },
    status: {
      type: String,
      enum: ["active", "removed", "edited"],
      default: "active",
    },
    reviewerNote: { type: String, trim: true, maxlength: 2000, default: "" },
    original: { type: mongoose.Schema.Types.Mixed, default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: false, _id: true },
);

const vastuReportSchema = new mongoose.Schema(
  {
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VastuRequest",
      required: true,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VastuReportTemplate",
      default: null,
    },
    sections: { type: [mongoose.Schema.Types.Mixed], default: [] },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    version: { type: Number, default: 1, min: 1 },

    score: { type: Number, min: 0, max: 100, default: null },
    verdict: { type: String, trim: true, maxlength: 120, default: "" },
    summary: { type: String, trim: true, maxlength: 5000, default: "" },
    conclusion: { type: String, trim: true, maxlength: 5000, default: "" },
    customRemarks: { type: String, trim: true, maxlength: 5000, default: "" },
    strengths: { type: [String], default: [] },

    findings: { type: [findingSchema], default: [] },
    zoneAnalysis: { type: [mongoose.Schema.Types.Mixed], default: [] },
    directionalAssessment: { type: [mongoose.Schema.Types.Mixed], default: [] },
    elementBalance: { type: mongoose.Schema.Types.Mixed, default: null },
    horoscope: { type: mongoose.Schema.Types.Mixed, default: null },
    missingInputs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    unverifiedInputs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    locationAssessment: { type: mongoose.Schema.Types.Mixed, default: null },
    recommendations: { type: [String], default: [] },

    disclaimer: { type: String, trim: true, maxlength: 2000, default: "" },
    ruleStats: { type: mongoose.Schema.Types.Mixed, default: null },

    generatedAt: { type: Date, default: Date.now },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    publishedAt: { type: Date, default: null },
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

vastuReportSchema.index({ user: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("VastuReport", vastuReportSchema);
