// Idempotent seed for the six AI Jyotishi personas.
// Usage: npm run seed-ai-jyotishis [-- --force]
// `--force` also refreshes prompts/prices/intro for existing profiles.
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const AiJyotishi = require("../models/aiJyotishi");
const { buildSystemPrompt } = require("../services/aiJyotishiPrompt");

const PROFILES = [
  {
    slug: "pandit-devanand",
    name: "Pandit Devanand",
    photo: "ai_jyotishi/devanand.png",
    age: 68,
    gender: "male",
    expertise: ["Vedic Jyotish", "Dasha", "Kundli"],
    categories: ["Career", "Marriage"],
    languages: ["Hindi", "Hinglish"],
    pricePerMin: 15,
    intro: "Saant aur buzurg andaz mein Vedic kundli ka gahana samjhate hain.",
    style: "shaant aur buzurg andaz",
  },
  {
    slug: "mata-savitri",
    name: "Mata Savitri",
    photo: "ai_jyotishi/savitri.png",
    age: 55,
    gender: "female",
    expertise: ["Marriage", "Parivar", "Vivah yog"],
    categories: ["Marriage", "Prem"],
    languages: ["Hindi", "Hinglish"],
    pricePerMin: 18,
    intro: "Mamta bhare andaz mein rishton aur parivar ke sawaalon ko samjhate hain.",
    style: "mamta bhara andaz",
  },
  {
    slug: "acharya-rohit",
    name: "Acharya Rohit",
    photo: "ai_jyotishi/rohit.png",
    age: 35,
    gender: "male",
    expertise: ["Career", "Business", "Finance"],
    categories: ["Career"],
    languages: ["Hindi", "Hinglish", "English"],
    pricePerMin: 20,
    intro: "Seedhi baat karne wale jyotishi — kyatiyon aur chance ko clear karte hain.",
    style: "seedhi baat",
  },
  {
    slug: "jyotishi-neha",
    name: "Jyotishi Neha",
    photo: "ai_jyotishi/neha.png",
    age: 28,
    gender: "female",
    expertise: ["Prem", "Relationship", "Patner yog"],
    categories: ["Prem", "Marriage"],
    languages: ["Hindi", "Hinglish", "Punjabi"],
    pricePerMin: 17,
    intro: "Dost jaisi baat karke prem aur rishton ki uljhan ko aasan banati hain.",
    style: "dost jaisa andaz",
  },
  {
    slug: "tarot-kabir",
    name: "Tarot Kabir",
    photo: "ai_jyotishi/kabir.png",
    age: 32,
    gender: "male",
    expertise: ["Tarot", "Prem", "Career"],
    categories: ["Prem", "Career"],
    languages: ["Hindi", "Hinglish", "English"],
    pricePerMin: 17,
    intro: "Friendly tarot reader jo card ke sandesh ko seedhi bhasha mein samjhate hain.",
    style: "friendly andaz",
  },
  {
    slug: "ank-guru-meera",
    name: "Ank Guru Meera",
    photo: "ai_jyotishi/meera.png",
    age: 45,
    gender: "female",
    expertise: ["Numerology", "Naam ank", "Janm ank"],
    categories: ["Career", "Prem"],
    languages: ["Hindi", "Hinglish", "Punjabi"],
    pricePerMin: 16,
    intro: "Ankon ko saral bhasha mein samjhakar roz ke faislon mein madad karti hain.",
    style: "saral samjhane wali andaz",
  },
];

const seedAiJyotishis = async ({ force = false } = {}) => {
  const results = [];
  for (const profile of PROFILES) {
    const systemPrompt = buildSystemPrompt(profile);
    const update = {
      $set: {
        name: profile.name,
        photo: profile.photo,
        age: profile.age,
        gender: profile.gender,
        expertise: profile.expertise,
        categories: profile.categories,
        languages: profile.languages,
        pricePerMin: profile.pricePerMin,
        intro: profile.intro,
        style: profile.style,
        systemPrompt,
        isActive: true,
      },
      $setOnInsert: { ratingAvg: 0, reviewCount: 0, totalChats: 0 },
    };
    // Existing rows are only touched when --force is passed, so an admin's
    // on/off switch and edits are never silently reset by a deploy.
    const doc = await AiJyotishi.findOneAndUpdate(
      { slug: profile.slug },
      force ? update : { $setOnInsert: { ...update.$set, ...update.$setOnInsert } },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );
    results.push({ slug: profile.slug, id: doc._id, created: force ? true : Boolean(doc.createdAt?.getTime() === doc.updatedAt?.getTime()) });
  }
  return results;
};

if (require.main === module) {
  const force = process.argv.includes("--force");
  (async () => {
    await connectDB();
    const results = await seedAiJyotishis({ force });
    console.log(`Seeded ${results.length} AI Jyotishis${force ? " (forced)" : ""}`);
    await mongoose.disconnect();
  })().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = { PROFILES, seedAiJyotishis };
