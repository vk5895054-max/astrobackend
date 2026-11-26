const express = require("express");

const router = express.Router();

const {
  register,
  login,
  logout,
  refresh,
  getMe,
} = require("../controllers/authController");

const { protect } = require("../middlewares/authMiddleware");

router.post("/register", register);

router.post("/login", login);

router.post("/logout", logout);

router.post("/refresh", refresh);

router.get("/me", protect, getMe);

module.exports = router;