const mongoose = require("mongoose");

// Stores user-side Astrologer section readings (Kundli Milan, Kundli AI, MyChart)
// so client insights flow directly to the consulted or selected astrologer.
const astrologerReadingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    astrologer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    consultationMatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      default: null,
      index: true,
    },
    kind: {
      type: String,
      enum: ["kundli_milan", "kundli_ai", "my_chart"],
      required: true,
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: String,
      trim: true,
      default: "general",
    },
    question: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    answer: {
      type: String,
      trim: true,
    },
    sources: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    report: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    kundliSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    myChartSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    sharedWithAstrologer: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

astrologerReadingSchema.index({ user: 1, astrologer: 1, createdAt: -1 });
astrologerReadingSchema.index({ astrologer: 1, sharedWithAstrologer: 1, createdAt: -1 });

module.exports = mongoose.model("AstrologerReading", astrologerReadingSchema);

