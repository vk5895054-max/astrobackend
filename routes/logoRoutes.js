const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { uploadLogoImage } = require("../middlewares/logoUpload");
const {
  generate,
  latest,
  analyze,
  listReviews,
} = require("../controllers/logoController");

const router = express.Router();

router.use(protect);
router.post("/generate", generate);
router.get("/latest", latest);
// Multipart with one logo image; companyName/notes travel as text fields.
router.post("/analyze", uploadLogoImage, analyze);
router.get("/reviews", listReviews);

module.exports = router;
