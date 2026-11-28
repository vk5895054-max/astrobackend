const mongoose = require("mongoose");

// One genuine review per user per AI persona. Ratings shown on listing cards
// are aggregated from this collection only.
const aiJyotishiReviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    jyotishi: { type: mongoose.Schema.Types.ObjectId, ref: "AiJyotishi", required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: "AiJyotishiSession", default: null },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true }
);

aiJyotishiReviewSchema.index({ user: 1, jyotishi: 1 }, { unique: true });
aiJyotishiReviewSchema.index({ jyotishi: 1, createdAt: -1 });

module.exports = mongoose.model("AiJyotishiReview", aiJyotishiReviewSchema);
