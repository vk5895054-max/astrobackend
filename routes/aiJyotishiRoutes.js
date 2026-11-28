const express = require("express");
const rateLimit = require("express-rate-limit");
const { protect } = require("../middlewares/authMiddleware");
const {
  list,
  detail,
  startSession,
  getSession,
  endSession,
  sendMessage,
  addReview,
  listReviews,
} = require("../controllers/aiJyotishiController");

const router = express.Router();

// Public directory. Chat endpoints require a real logged-in user because the
// wallet and every rating are tied to that account.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many messages, please slow down" },
});

router.get("/", list);
router.get("/:id", detail);
router.get("/:id/reviews", listReviews);

router.use(protect);
router.post("/sessions", chatLimiter, startSession);
router.get("/sessions/:sessionId", getSession);
router.post("/sessions/:sessionId/messages", chatLimiter, sendMessage);
router.post("/sessions/:sessionId/end", endSession);
router.post("/:id/reviews", addReview);

module.exports = router;
