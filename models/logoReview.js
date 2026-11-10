const mongoose = require("mongoose");

// Saved logo reviews. The uploaded image itself is not stored — only the
// structured feedback, so the owner can revisit the advice later.
const logoReviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    companyName: { type: String, trim: true, maxlength: 80 },
    notes: { type: String, trim: true, maxlength: 1000 },
    score: { type: Number, min: 0, max: 100 },
    verdict: { type: String, trim: true, maxlength: 80 },
    summary: { type: String, trim: true, maxlength: 2000 },
    strengths: { type: [mongoose.Schema.Types.Mixed], default: [] },
    weaknesses: { type: [mongoose.Schema.Types.Mixed], default: [] },
    suggestions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    quickFixes: { type: [String], default: [] },
    disclaimer: { type: String, trim: true, maxlength: 500 },
    rawText: { type: String, trim: true },
  },
  { timestamps: true },
);

logoReviewSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("LogoReview", logoReviewSchema);
