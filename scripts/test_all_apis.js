const http = require("http");
const mongoose = require("mongoose");
require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");

const apiLanguageMiddleware = require("../middlewares/apiLanguageMiddleware");
const connectDB = require("../config/db");

async function main() {
  console.log("=== COMPREHENSIVE API TEST & LATENCY BENCHMARK ===");
  const tDbStart = Date.now();
  await connectDB();
  console.log(`Connected to DB in ${Date.now() - tDbStart}ms\n`);

  const serverApp = express();
  serverApp.use(express.json());
  serverApp.use(cookieParser());
  serverApp.use(apiLanguageMiddleware);

  // Mount all application routes
  serverApp.get("/", (req, res) => res.json({ success: true, message: "Matchmaking API is running" }));
  serverApp.get("/health", (req, res) => res.json({ success: true, message: "Server is running" }));
  serverApp.use("/api/auth", require("../routes/authRoute"));
  serverApp.use("/api/admin", require("../routes/adminRoutes"));
  serverApp.use("/api/profile", require("../routes/profileRoutes"));
  serverApp.use("/api/questionnaire", require("../routes/questionnaireRoutes"));
  serverApp.use("/api/horoscope", require("../routes/horoscopeRoutes"));
  serverApp.use("/api/matchmaking", require("../routes/matchMakingRoute"));
  serverApp.use("/api/chat", require("../routes/chatRoutes"));
  serverApp.use("/api/calls", require("../routes/callRoutes"));
  serverApp.use("/api/astrologers", require("../routes/astrologerRoutes"));
  serverApp.use("/api/consultations", require("../routes/consultationRoutes"));
  serverApp.use("/api/wallet", require("../routes/walletRoutes"));
  serverApp.use("/api/astrologer", require("../routes/astrologerDashboardRoutes"));
  serverApp.use("/api/astro-qa", require("../routes/astroQARoutes"));
  serverApp.use("/api/numerology", require("../routes/numerologyRoutes"));
  const readingAdminRoutes = require("../routes/readingAdminRoutes");
  const readingRoutes = require("../routes/readingRoutes");
  serverApp.use("/api/face-palm", readingRoutes.facePalmRoutes);
  serverApp.use("/api/face-reading/admin", readingAdminRoutes.faceReadingAdminRoutes);
  serverApp.use("/api/face-reading", readingRoutes.faceReadingRoutes);
  serverApp.use("/api/palm-reading/admin", readingAdminRoutes.palmReadingAdminRoutes);
  serverApp.use("/api/palm-reading", readingRoutes.palmReadingRoutes);
  serverApp.use("/api/vastu/admin", require("../routes/vastuAdminRoutes"));
  serverApp.use("/api/vastu/astrologer", require("../routes/vastuAstrologerRoutes"));
  serverApp.use("/api/vastu", require("../routes/vastuRoutes"));
  serverApp.use("/api/logo", require("../routes/logoRoutes"));
  serverApp.use("/api/kundli", require("../routes/kundliRoutes"));
  serverApp.use("/api/notifications", require("../routes/notificationRoutes"));
  serverApp.use("/api/health", require("../routes/healthRoutes"));

  // Central error handler
  serverApp.use((err, req, res, next) => {
    res.status(err.status || 500).json({ success: false, message: err.message });
  });

  const server = http.createServer(serverApp);
  await new Promise((resolve) => server.listen(5098, resolve));
  const baseUrl = "http://127.0.0.1:5098";

  const results = [];

  async function testEndpoint(name, method, path, body = null, headers = {}) {
    const start = process.hrtime.bigint();
    let status = 0;
    let size = 0;
    let error = null;
    let data = null;
    try {
      const opts = {
        method,
        headers: { "Content-Type": "application/json", ...headers },
      };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(`${baseUrl}${path}`, opts);
      status = res.status;
      const text = await res.text();
      size = Buffer.byteLength(text);
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = text.slice(0, 100);
      }
    } catch (e) {
      error = e.message;
    }
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    const ok = status >= 200 && status < 400;
    results.push({ name, method, path, status, durationMs, size, error, ok, message: data?.message });
    const tag = ok ? "OK  " : status === 401 || status === 403 ? "AUTH" : "FAIL";
    const msg = data && data.message ? `[${data.message.slice(0, 40)}]` : "";
    console.log(
      `[${tag}] ${method.padEnd(5)} ${path.padEnd(42)} -> ${String(status).padEnd(3)} (${durationMs.toFixed(1).padStart(6)}ms, ${(size / 1024).toFixed(1).padStart(5)}KB) ${msg}`
    );
    return { status, data, durationMs };
  }

  console.log("--- 1. PUBLIC ENDPOINTS ---");
  await testEndpoint("Root", "GET", "/");
  await testEndpoint("Health", "GET", "/health");
  await testEndpoint("Health API", "GET", "/api/health");
  await testEndpoint("Kundli Categories", "GET", "/api/kundli/categories");

  console.log("\n--- 2. ASTRONOMICAL & VEDIC CALCULATIONS ---");
  await testEndpoint("Kundli Calculate (All)", "POST", "/api/kundli/calculate", {
    name: "Arjun Sharma",
    dateOfBirth: "1995-04-12",
    timeOfBirth: "15:56:00",
    latitude: 27.1767,
    longitude: 78.0081,
    timeZoneOffsetMinutes: 330,
    category: "all"
  });

  await testEndpoint("Kundli Lal Kitab Varsha Phal", "POST", "/api/kundli/lal-kitab-varsha-phal", {
    dateOfBirth: "1995-04-12",
    timeOfBirth: "15:56:00",
    latitude: 27.1767,
    longitude: 78.0081,
    timeZoneOffsetMinutes: 330,
    year: 2026
  });

  await testEndpoint("Vedic Vastu Analyze", "POST", "/api/vastu/analyze", {
    propertyType: "residential",
    facingDirection: "north",
    rooms: [
      { name: "Kitchen", zone: "SE" },
      { name: "Master Bedroom", zone: "SW" },
      { name: "Main Entrance", zone: "N" }
    ]
  });

  console.log("\n--- 3. AUTHENTICATION FLOW ---");
  const testEmail = `perf_${Date.now()}@example.com`;
  const registerRes = await testEndpoint("Auth Register", "POST", "/api/auth/register", {
    name: "Performance Tester",
    email: testEmail,
    password: "Password123!",
    gender: "male"
  });

  const loginRes = await testEndpoint("Auth Login", "POST", "/api/auth/login", {
    email: testEmail,
    password: "Password123!"
  });

  const token = loginRes.data?.token || registerRes.data?.token;
  const authHeaders = { Authorization: `Bearer ${token}` };

  console.log("\n--- 4. USER AUTHENTICATED ENDPOINTS ---");
  await testEndpoint("Auth Me", "GET", "/api/auth/me", null, authHeaders);

  // Setup profile
  await testEndpoint("Profile Save", "POST", "/api/profile", {
    dateOfBirth: "1995-04-12",
    currentCity: "Delhi",
    occupation: "Software Engineer",
    education: "B.Tech",
    relationshipGoal: "marriage",
    about: "Testing performance"
  }, authHeaders);
  await testEndpoint("Profile Me", "GET", "/api/profile/me", null, authHeaders);

  // Setup questionnaire
  await testEndpoint("Questionnaire Save", "POST", "/api/questionnaire", {
    decisionMaking: "logical",
    socialNature: "ambivert",
    changeVsStability: "stability",
    emotionalHandling: "calm",
    emotionalSupport: "listener",
    stressResponse: "meditation",
    disagreementStyle: "discussion",
    communicationImportance: "high",
    problemSolving: "analytical",
    trustBuilding: "gradual",
    honesty: "essential",
    commitment: "high",
    responsibility: "shared",
    decisionHandling: "collaborative",
    conflictResolution: "talk",
    familyImportance: "very_high",
    familyInvolvement: "moderate",
    socialLifestyle: "moderate",
    travelPreferences: "mountains",
    dailyRoutine: "organized",
    careerPriority: "balanced",
    financialApproach: "savings",
    careerAfterMarriage: "supportive",
    idealRelationship: "equal_partnership",
    personalSpace: "respected",
    longTermGoals: "family_and_career"
  }, authHeaders);
  await testEndpoint("Questionnaire Me", "GET", "/api/questionnaire/me", null, authHeaders);

  // Setup horoscope
  await testEndpoint("Horoscope Save", "POST", "/api/horoscope", {
    birthDate: "1995-04-12",
    birthTime: "15:56",
    birthPlace: "Delhi, India",
    latitude: 28.6139,
    longitude: 77.2090,
    timeZoneOffsetMinutes: 330
  }, authHeaders);
  await testEndpoint("Horoscope Me", "GET", "/api/horoscope/me", null, authHeaders);
  await testEndpoint("Horoscope Charts", "GET", "/api/horoscope/charts", null, authHeaders);
  await testEndpoint("Horoscope Dasha", "GET", "/api/horoscope/dasha", null, authHeaders);

  console.log("\n--- 5. ASTROLOGERS & CONSULTATIONS ---");
  await testEndpoint("Astrologers Directory", "GET", "/api/astrologers", null, authHeaders);
  await testEndpoint("Astrologers Features", "GET", "/api/astrologers/features", null, authHeaders);
  await testEndpoint("Astrologers Readings", "GET", "/api/astrologers/readings", null, authHeaders);

  console.log("\n--- 6. KUNDLI EXTENDED ENDPOINTS ---");
  await testEndpoint("Kundli My-Kundli", "GET", "/api/kundli/my-kundli", null, authHeaders);
  await testEndpoint("Kundli My-Chart", "GET", "/api/kundli/my-chart", null, authHeaders);
  await testEndpoint("Kundli Saved List", "GET", "/api/kundli/saved-kundlis", null, authHeaders);
  await testEndpoint("Kundli Match", "POST", "/api/kundli/match", {
    boy: {
      name: "Rohan",
      dateOfBirth: "1992-05-15",
      timeOfBirth: "10:30",
      latitude: 28.6139,
      longitude: 77.2090,
      timeZoneOffsetMinutes: 330
    },
    girl: {
      name: "Priya",
      dateOfBirth: "1994-08-20",
      timeOfBirth: "14:15",
      latitude: 19.0760,
      longitude: 72.8777,
      timeZoneOffsetMinutes: 330
    }
  }, authHeaders);
  await testEndpoint("Kundli Bodygraph Compatibility", "POST", "/api/kundli/bodygraph-compatibility", {
    partnerA: {
      name: "Partner A",
      dateOfBirth: "1992-05-15",
      timeOfBirth: "10:30",
      latitude: 28.6139,
      longitude: 77.2090,
      timeZoneOffsetMinutes: 330
    },
    partnerB: {
      name: "Partner B",
      dateOfBirth: "1994-08-20",
      timeOfBirth: "14:15",
      latitude: 19.0760,
      longitude: 72.8777,
      timeZoneOffsetMinutes: 330
    }
  }, authHeaders);

  console.log("\n--- 7. MATCHMAKING & CHAT ---");
  await testEndpoint("Matchmaking Recommendations", "GET", "/api/matchmaking/recommendations", null, authHeaders);
  await testEndpoint("Matchmaking My Matches", "GET", "/api/matchmaking/my-matches", null, authHeaders);
  await testEndpoint("Chat History", "GET", "/api/chat/history", null, authHeaders);

  console.log("\n--- 8. WALLET & OTHER SERVICES ---");
  await testEndpoint("Wallet Me", "GET", "/api/wallet/me", null, authHeaders);
  await testEndpoint("Wallet Transactions", "GET", "/api/wallet/transactions", null, authHeaders);
  await testEndpoint("Face-Palm Billing", "GET", "/api/face-palm/billing", null, authHeaders);
  await testEndpoint("Face-Palm History", "GET", "/api/face-palm/history", null, authHeaders);
  await testEndpoint("Numerology Profile", "GET", "/api/numerology/profile", null, authHeaders);
  await testEndpoint("Numerology Billing", "GET", "/api/numerology/billing", null, authHeaders);
  await testEndpoint("Numerology History", "GET", "/api/numerology/history", null, authHeaders);
  await testEndpoint("Vastu Requests", "GET", "/api/vastu/requests", null, authHeaders);

  // Cleanup
  const User = require("../models/user");
  const Profile = require("../models/profile");
  const Questionnaire = require("../models/questionnaire");
  const Horoscope = require("../models/horoscope");
  await User.deleteOne({ email: testEmail });
  await Profile.deleteOne({ user: loginRes.data?.user?._id });
  await Questionnaire.deleteOne({ user: loginRes.data?.user?._id });
  await Horoscope.deleteOne({ user: loginRes.data?.user?._id });

  console.log("\n==============================================");
  console.log("=== PERFORMANCE RANKING (Slowest to Fastest) ===");
  console.log("==============================================");
  const sorted = [...results].sort((a, b) => b.durationMs - a.durationMs);
  sorted.forEach((r, idx) => {
    const star = r.durationMs > 200 ? "⚠️  SLOW" : r.durationMs > 100 ? "⚡ OK  " : "🚀 FAST";
    console.log(
      `${(idx + 1).toString().padStart(2)}. ${star} [${r.durationMs.toFixed(1).padStart(6)}ms] ${r.method.padEnd(5)} ${r.path.padEnd(42)} (${(r.size/1024).toFixed(1).padStart(5)}KB)`
    );
  });

  server.close();
  await mongoose.disconnect();
  console.log("\nBenchmark complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
