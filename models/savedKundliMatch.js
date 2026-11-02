const mongoose = require("mongoose");

const savedKundliMatchSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fingerprint: { type: String, required: true },
    report: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

savedKundliMatchSchema.index(
  { user: 1, fingerprint: 1 },
  { unique: true },
);

module.exports = mongoose.model("SavedKundliMatch", savedKundliMatchSchema);
