const mongoose = require("mongoose");

// One row per generated logo direction. The rendered logo lives in `design` as
// a spec so the client can redraw it at any size and an exporter can be added
// later without a migration.
const logoDesignSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    input: {
      fullName: { type: String, trim: true, maxlength: 100 },
      companyName: { type: String, trim: true, maxlength: 80 },
      dateOfBirth: { type: Date },
      birthTime: { type: String, trim: true, maxlength: 5 },
      location: { type: String, trim: true, maxlength: 100 },
    },
    numbers: { type: mongoose.Schema.Types.Mixed },
    design: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

logoDesignSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("LogoDesign", logoDesignSchema);
