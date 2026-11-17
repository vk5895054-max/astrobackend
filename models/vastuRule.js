const mongoose = require("mongoose");
const {
  RULE_CATEGORIES,
  ZONE_KEYS,
  PROPERTY_TYPES,
  CONDITION_OPS,
} = require("../services/vastuRulesEngine");

// Admin-managed Vastu rule. The actual evaluation happens in
// services/vastuRulesEngine.js; this document is the editable source of truth.
//
// Conditions are intentionally stored as a small JSON condition tree:
//   { all: [{ field: "kitchenDirection", op: "eq", value: "north-east" }] }
// Admins can combine all/any/none groups, compare two fields (eq_field), test
// membership, and use numeric thresholds. No arbitrary code is executed.
const conditionSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    op: {
      type: String,
      required: true,
      enum: CONDITION_OPS,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false },
);

const conditionsSchema = new mongoose.Schema(
  {
    all: { type: [conditionSchema], default: undefined },
    any: { type: [conditionSchema], default: undefined },
    none: { type: [conditionSchema], default: undefined },
  },
  { _id: false },
);

const vastuRuleSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9][a-z0-9-_]{2,80}$/, "Rule code must be a short lowercase identifier"],
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    kind: {
      type: String,
      enum: ["concern", "strength"],
      default: "concern",
      index: true,
    },
    category: {
      type: String,
      enum: RULE_CATEGORIES,
      required: true,
      index: true,
    },
    zone: { type: String, trim: true, maxlength: 120, default: "" },
    zoneKey: {
      type: String,
      enum: ZONE_KEYS,
      default: "other",
      index: true,
    },
    direction: {
      type: String,
      enum: ["", "north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west", "centre"],
      default: "",
    },
    concern: {
      type: String,
      enum: ["low", "moderate", "high"],
      default: "moderate",
    },
    explanation: { type: String, required: true, trim: true, maxlength: 4000 },
    remedy: { type: String, trim: true, maxlength: 4000, default: "" },
    source: { type: String, trim: true, maxlength: 500, default: "" },
    conditions: { type: conditionsSchema, required: true },
    appliesTo: {
      type: [{ type: String, enum: PROPERTY_TYPES }],
      default: [],
    },
    optional: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true, index: true },
    isSystem: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    notesForReviewer: { type: String, trim: true, maxlength: 2000, default: "" },
    sortOrder: { type: Number, default: 0, index: true },
    version: { type: Number, default: 1, min: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

vastuRuleSchema.index({ enabled: 1, sortOrder: 1 });
vastuRuleSchema.index({ category: 1, enabled: 1 });
vastuRuleSchema.index({ title: "text", explanation: "text", remedy: "text", tags: "text" });

module.exports = mongoose.model("VastuRule", vastuRuleSchema);
module.exports.conditionSchema = conditionSchema;
module.exports.conditionsSchema = conditionsSchema;
