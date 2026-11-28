const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
require("dotenv").config();

const connectDB = require("./config/db");
const { setupChatSockets } = require("./services/chatSocketService");
const { setIo } = require("./services/socketHub");
const { startBillingSweep } = require("./services/consultationBilling");
const apiLanguageMiddleware = require("./middlewares/apiLanguageMiddleware");

const app = express();
const httpServer = http.createServer(app);

// Behind Render's proxy this is required so rate limiting sees the real
// client IP instead of the proxy's (which would throttle every user as one).
app.set("trust proxy", 1);
app.use(apiLanguageMiddleware);

// Database
connectDB();

// Allowed browser origins in production: CLIENT_URL plus optional comma
// separated CORS_ORIGINS (e.g. the admin panel's URL). Production fails closed:
// reflecting any origin while `credentials: true` would let arbitrary sites
// call authenticated (including admin) APIs with a victim's cookie.
const configuredOrigins = [
  ...(process.env.CLIENT_URL || "").split(","),
  ...(process.env.CORS_ORIGINS || "").split(","),
]
  .map((origin) => origin.trim())
  .filter(Boolean);
if (process.env.NODE_ENV === "production" && configuredOrigins.length === 0) {
  console.warn(
    "[security] No CLIENT_URL/CORS_ORIGINS configured: cross-origin requests are blocked. " +
      "Configure an explicit allowlist if the app is served from another origin.",
  );
}
const corsOrigin =
  process.env.NODE_ENV === "production"
    ? configuredOrigins.length
      ? configuredOrigins
      : false
    : true;

// Middleware
app.use(compression());
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

// Security headers. CSP is off because this is a JSON API (the admin SPA
// serves its own HTML) and uploads must stay loadable cross-origin.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Global throttle; auth endpoints get a much tighter bucket below.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message: "Too many requests, please try again later" },
  })
);
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, please try again later" },
});

app.use(express.json({
  verify: (req, res, buf) => {
    // Keep raw bytes for Razorpay webhook HMAC verification
    if (req.originalUrl && req.originalUrl.includes("/api/wallet/webhook")) {
      req.rawBody = buf;
    }
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Test route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Matchmaking API is running",
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running"
  });
});


app.use("/api/auth", authLimiter, require("./routes/authRoute"));
app.use("/api/admin", authLimiter, require("./routes/adminRoutes"));
app.use("/api/profile", require("./routes/profileRoutes"));
app.use("/api/questionnaire", require("./routes/questionnaireRoutes"));
app.use("/api/horoscope", require("./routes/horoscopeRoutes"));
app.use("/api/matchmaking", require("./routes/matchMakingRoute"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/calls", require("./routes/callRoutes"));
app.use("/api/astrologers", require("./routes/astrologerRoutes"));
app.use("/api/ai-jyotishis", require("./routes/aiJyotishiRoutes"));
app.use("/api/consultations", require("./routes/consultationRoutes"));
app.use("/api/wallet", require("./routes/walletRoutes"));
app.use("/api/astrologer", require("./routes/astrologerDashboardRoutes"));
app.use("/api/astro-qa", require("./routes/astroQARoutes"));
app.use("/api/numerology", require("./routes/numerologyRoutes"));
// Face & Palm reading: admin prefixes must be registered before the user
// routers so /api/*/admin is not shadowed by /reports/:id.
const readingAdminRoutes = require("./routes/readingAdminRoutes");
const readingRoutes = require("./routes/readingRoutes");
// Shared app-facing router (the client sends `type` in the request body).
app.use("/api/face-palm", readingRoutes.facePalmRoutes);
app.use("/api/graphology", readingRoutes.graphologyRoutes);
app.use("/api/drawing-analysis", readingRoutes.drawingRoutes);
app.use("/api/face-reading/admin", readingAdminRoutes.faceReadingAdminRoutes);
app.use("/api/face-reading", readingRoutes.faceReadingRoutes);
app.use("/api/palm-reading/admin", readingAdminRoutes.palmReadingAdminRoutes);
app.use("/api/palm-reading", readingRoutes.palmReadingRoutes);
// The admin and astrologer consoles must be registered before the user routes
// so /api/vastu/admin and /api/vastu/astrologer are not shadowed.
app.use("/api/vastu/admin", require("./routes/vastuAdminRoutes"));
app.use("/api/vastu/astrologer", require("./routes/vastuAstrologerRoutes"));
app.use("/api/vastu", require("./routes/vastuRoutes"));
app.use("/api/logo", require("./routes/logoRoutes"));
app.use("/api/kundli", require("./routes/kundliRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/health", require("./routes/healthRoutes"));


const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});
setupChatSockets(io);
setIo(io);

// Consultation billing runs on a timer, not only when someone types: this is
// what debits each started paid minute and stops a chat/call the moment the
// client's paid minutes are over — even during a silent voice call.
startBillingSweep();

app.use((error, req, res, next) => {
  if (error instanceof require("multer").MulterError || error.message?.includes("are allowed")) {
    return res.status(400).json({ success: false, message: error.message });
  }
  if (error.name === "ValidationError") return res.status(422).json({ success: false, message: "Validation failed" });
  if (error.code === 11000) return res.status(409).json({ success: false, message: "A record with that value already exists" });
  if (error.name === "CastError") return res.status(400).json({ success: false, message: "Invalid identifier" });
  if (error.expose && error.statusCode) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error(error);
  return res.status(500).json({ success: false, message: "Something went wrong" });
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = { app, httpServer };

