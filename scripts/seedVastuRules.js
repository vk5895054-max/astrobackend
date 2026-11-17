// Seeds the default Vastu rule set and report template.
//
// Run with: node scripts/seedVastuRules.js
// Force-reset the default rules: node scripts/seedVastuRules.js --force
// Or use the npm script: npm run seed-vastu-rules

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const connectDB = require("../config/db");
const { seedVastuRules } = require("../services/vastuSeedService");
const { disconnectDB } = require("../config/db");

const force = process.argv.slice(2).includes("--force");

(async () => {
  try {
    await connectDB();
    const result = await seedVastuRules({ force });
    console.log(
      `Vastu rules: ${result.total} defaults, ${result.inserted} inserted, ${result.updated} updated, ${result.invalid} invalid.`,
    );
    console.log(`Default report template: ${result.templateId}`);
    if (typeof disconnectDB === "function") {
      await disconnectDB();
    } else {
      const mongoose = require("mongoose");
      await mongoose.disconnect();
    }
    process.exit(0);
  } catch (error) {
    console.error("Failed to seed Vastu rules:", error);
    process.exit(1);
  }
})();
