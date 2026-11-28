const mongoose = require("mongoose");

// Admin-managed AI persona. Human astrologers live in AstrologerProfile;
// keeping AI profiles separate means ratings/reviews can never be seeded or
// edited by hand and the two directories have independent on/off switches.
const aiJyotishiSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    // A dedicated asset slot per persona. The Flutter app falls back to an
    // initial-based avatar when the file/URL is not present yet.
    photo: { type: String, default: null },
    age: { type: Number, required: true, min: 18, max: 120 },
    gender: { type: String, required: true, enum: ["male", "female", "other"] },
    expertise: { type: [String], default: [] },
    // Directory chips: Sabhi (all), Prem, Career, Marriage, Tarot, Numerology.
    categories: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    pricePerMin: { type: Number, required: true, min: 1, max: 10000 },
    intro: { type: String, default: "", maxlength: 2000 },
    style: { type: String, required: true, default: "shaant aur buzurg" },
    systemPrompt: { type: String, required: true, default: "" },
    isActive: { type: Boolean, default: true },
    // Derived only from genuine user reviews (AiJyotishiReview), never accepted
    // from an admin payload. A profile with reviewCount === 0 renders as "New".
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    totalChats: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

aiJyotishiSchema.index({ isActive: 1, categories: 1 });
aiJyotishiSchema.index({ name: "text", expertise: "text", intro: "text" });

module.exports = mongoose.model("AiJyotishi", aiJyotishiSchema);
