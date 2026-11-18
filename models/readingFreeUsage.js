const mongoose = require("mongoose");

// Tracks the free basic reading allowance per feature. Detailed readings and
// readings after the free quota are charged to the prepaid wallet.
const readingFreeUsageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    faceUsed: { type: Number, default: 0, min: 0 },
    palmUsed: { type: Number, default: 0, min: 0 },
    faceLimit: { type: Number, default: 1, min: 0 },
    palmLimit: { type: Number, default: 1, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReadingFreeUsage", readingFreeUsageSchema);
