const mongoose = require("mongoose");
const { DEFAULT_TEMPLATE_SECTIONS } = require("../services/vastuRulesEngine");

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const vastuReportTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    isDefault: { type: Boolean, default: false, index: true },
    sections: { type: [sectionSchema], default: () => DEFAULT_TEMPLATE_SECTIONS },
    disclaimer: { type: String, trim: true, maxlength: 2000, default: "" },
    footerNote: { type: String, trim: true, maxlength: 1000, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("VastuReportTemplate", vastuReportTemplateSchema);
