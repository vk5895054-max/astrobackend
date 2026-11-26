const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Questionnaire = require("../models/questionnaire");
const refreshTokenService = require("../services/refreshTokenService");

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
});

const generateToken = (userId) => {
  return jwt.sign(
    {
      userId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
};

// REGISTER
const register = async (req, res) => {
  try {
    const { name, email, password, gender } = req.body;

    if (!name || !email || !password || !gender) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }
    if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid registration details",
      });
    }

    const existingUser = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      gender,
    });

    let questionnaire = null;
    const qInput = req.body.questionnaire || req.body;
    if (qInput && typeof qInput === "object") {
      const qData = Object.fromEntries(
        Questionnaire.fields
          .filter((field) => qInput[field] !== undefined && typeof qInput[field] === "string" && qInput[field].trim())
          .map((field) => [field, qInput[field].trim()])
      );
      if (Object.keys(qData).length > 0) {
        questionnaire = await Questionnaire.create({
          user: user._id,
          ...qData,
        });
      }
    }

    const token = generateToken(user._id);
    const refreshToken = await refreshTokenService.issueFor(user);

    res.cookie("token", token, {
      ...cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions(),
      maxAge: refreshTokenService.REFRESH_TTL_MS,
    });

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      refreshToken,
      user: {
        ...user.toSafeObject(),
      },
      questionnaire,
    });
  } catch (error) {
    // Two registrations with the same email can race past the pre-check and
    // lose on the unique index. That is a client conflict, not a server error.
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }
    console.error("Register Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// LOGIN
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+refreshTokens");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = generateToken(user._id);
    const refreshToken = await refreshTokenService.issueFor(user);

    res.cookie("token", token, {
      ...cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions(),
      maxAge: refreshTokenService.REFRESH_TTL_MS,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      refreshToken,
      user: {
        ...user.toSafeObject(),
      },
    });
  } catch (error) {
    console.error("Login Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// LOGOUT
const logout = async (req, res) => {
  try {
    // Only this device's refresh session is revoked; other signed-in devices
    // stay logged in until they log out themselves.
    await refreshTokenService.revoke(
      (req.body && req.body.refreshToken) || req.cookies?.refreshToken
    );
    res.clearCookie("token", cookieOptions());
    res.clearCookie("refreshToken", cookieOptions());

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// REFRESH
// A short-lived access token can expire without forcing a full login. The
// refresh token is single-use and rotated on every call, so a stolen copy
// cannot be replayed after the legitimate device has refreshed.
const refresh = async (req, res) => {
  try {
    const raw =
      (req.body && req.body.refreshToken) || req.cookies?.refreshToken;
    const rotated = await refreshTokenService.rotate(raw);
    if (!rotated) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }

    const token = generateToken(rotated.user._id);
    res.cookie("token", token, {
      ...cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.cookie("refreshToken", rotated.refreshToken, {
      ...cookieOptions(),
      maxAge: refreshTokenService.REFRESH_TTL_MS,
    });

    return res.status(200).json({
      success: true,
      token,
      refreshToken: rotated.refreshToken,
      user: rotated.user.toSafeObject(),
    });
  } catch (error) {
    console.error("Refresh Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// GET CURRENT USER
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user.toSafeObject(),
    });
  } catch (error) {
    console.error("Get Me Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  register,
  login,
  logout,
  refresh,
  getMe,
};