const mongoose = require("mongoose");

const aiJyotishiSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jyotishi: { type: mongoose.Schema.Types.ObjectId, ref: "AiJyotishi", required: true },
    birthDetails: {
      name: { type: String, default: "" },
      dateOfBirth: { type: String, default: "" },
      timeOfBirth: { type: String, default: "" },
      place: { type: String, default: "" },
      latitude: { type: Number, default: undefined },
      longitude: { type: Number, default: undefined },
      timeZoneOffsetMinutes: { type: Number, default: 330 },
    },
    // Only values produced by the server-side ephemeris are stored. The model
    // never sees a fabricated Lagna/planet position.
    kundli: { type: mongoose.Schema.Types.Mixed, default: null },
    locale: { type: String, default: "hi-IN" },
    status: {
      type: String,
      enum: ["active", "ended", "exhausted", "safety_stopped", "closed_by_admin"],
      default: "active",
    },
    endReason: { type: String, default: null },
    pricePerMin: { type: Number, required: true, min: 1 },
    billedMinutes: { type: Number, default: 0, min: 0 },
    billedAmount: { type: Number, default: 0, min: 0 },
    refundedAmount: { type: Number, default: 0, min: 0 },
    warningSentAt: { type: Date, default: null },
    startedAt: { type: Date, default: Date.now },
    lastMessageAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

aiJyotishiSessionSchema.index({ user: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model("AiJyotishiSession", aiJyotishiSessionSchema);
