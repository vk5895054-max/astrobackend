const express = require("express");
const { protect, optionalProtect } = require("../middlewares/authMiddleware");
const { uploadOptionalImages } = require("../middlewares/uploadMiddleware");
const { kundliMatch } = require("../controllers/kundliMatchController");
const {
  createSavedKundli,
  deleteSavedKundli,
  getSavedKundli,
  listSavedKundlis,
  listSavedMatches,
  saveKundliMatch,
} = require("../controllers/kundliSavedController");
const {
  calculateKundli,
  calculateLalKitabVarshaPhal,
  getMyKundli,
  getCategories,
  chatKundli,
} = require("../controllers/kundliController");

const router = express.Router();

// Public / Guest accessible endpoints (supports optional token for auto-saving)
router.post("/calculate", optionalProtect, calculateKundli);
router.post("/lal-kitab-varsha-phal", optionalProtect, calculateLalKitabVarshaPhal);
router.get("/categories", getCategories);
// Multipart form-data with optional chart images — JSON bodies (where
// birthDetails is an object) pass through the middleware untouched.
router.post("/chat", optionalProtect, uploadOptionalImages, chatKundli);

// Authenticated user endpoints
router.get("/my-kundli", protect, getMyKundli);
router.post("/match", protect, kundliMatch);
router.get("/saved-kundlis", protect, listSavedKundlis);
router.post("/saved-kundlis", protect, createSavedKundli);
router.get("/saved-kundlis/:id", protect, getSavedKundli);
router.delete("/saved-kundlis/:id", protect, deleteSavedKundli);
router.get("/saved-matches", protect, listSavedMatches);
router.post("/saved-matches", protect, saveKundliMatch);

module.exports = router;

router.get("/lal-kitab-varshphal", optionalProtect, (req, res) => {
  const categoriesList = req.app.get("categoriesList");
  const category = categoriesList.find(c => c.key === "lal_kitab_varshphal");
  if (category) {
    return res.status(200).json({
      success: true,
      data: category
    });
  }
  return res.status(404).json({ success: false, message: "Category not found" });

router.post("/my-chart", optionalProtect, myChart);
});
