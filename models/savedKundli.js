const mongoose = require("mongoose");

const savedKundliSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, trim: true, required: true },
    dateOfBirth: { type: Date, required: true },
    timeOfBirth: { type: String, trim: true, required: true },
    place: { type: String, trim: true, required: true },
    gender: { type: String, trim: true, default: "Male" },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timeZoneOffsetMinutes: { type: Number, required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SavedKundli", savedKundliSchema);
