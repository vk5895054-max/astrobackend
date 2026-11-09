const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { uploadOptionalImages } = require("../middlewares/uploadMiddleware");
const {
  listAstrologers,
  getAstrologerDetail,
  listReviews,
} = require("../controllers/astrologerController");
const {
  getAstrologerFeatures,
  runAstrologerKundliMilan,
  listAstrologerSavedMatches,
  saveAstrologerKundliMatch,
  getAstrologerKundliAiCategories,
  getAstrologerKundliAiMyKundli,
  calculateAstrologerKundliAi,
  chatAstrologerKundliAi,
  calculateAstrologerKundliAiVarshaPhal,
  handleAstrologerMyChart,
  listMyAstrologerReadings,
} = require("../controllers/astrologerFeatureController");

const router = express.Router();
router.use(protect);

// User-side Astrologers section features (must be registered before /:id)
router.get("/features", getAstrologerFeatures);
router.get("/readings", listMyAstrologerReadings);
router.get("/my-chart", handleAstrologerMyChart);
router.post("/my-chart", handleAstrologerMyChart);

router.post("/kundli-milan", runAstrologerKundliMilan);
router.get("/kundli-milan/saved", listAstrologerSavedMatches);
router.post("/kundli-milan/saved", saveAstrologerKundliMatch);

router.get("/kundli-ai/categories", getAstrologerKundliAiCategories);
router.get("/kundli-ai/my-kundli", getAstrologerKundliAiMyKundli);
router.post("/kundli-ai/calculate", calculateAstrologerKundliAi);
router.post("/kundli-ai/chat", uploadOptionalImages, chatAstrologerKundliAi);
router.post("/kundli-ai/varsha-phal", calculateAstrologerKundliAiVarshaPhal);

router.get("/", listAstrologers);
router.get("/:id", getAstrologerDetail);
router.get("/:id/reviews", listReviews);
router.post("/:id/kundli-milan", runAstrologerKundliMilan);
router.post("/:id/kundli-ai/chat", uploadOptionalImages, chatAstrologerKundliAi);

module.exports = router;
