const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { uploadVastuMedia } = require("../middlewares/vastuUpload");
const { analyze } = require("../controllers/vastuController");

const router = express.Router();

router.use(protect);
// Multipart with one floor-map image and one walkthrough video.
router.post("/analyze", uploadVastuMedia, analyze);

module.exports = router;
