const DeviceToken = require("../models/deviceToken");
const { sendNotificationToUser } = require("../services/notificationService");

// Device tokens are push credentials and must never be echoed back in full.
const maskToken = (token) => {
  if (typeof token !== "string" || token.length < 12) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
};

const sanitizeDeviceToken = (doc) => {
  const data = typeof doc?.toObject === "function" ? doc.toObject() : { ...doc };
  if (data.token) data.token = maskToken(data.token);
  return data;
};

const registerDeviceToken = async (req, res, next) => {
  try {
    const { token, platform } = req.body;

    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    const cleanToken = token.trim();
    // A token is tied to the account that registered it. Previously an upsert
    // on `{ token }` alone let any authenticated user steal another account's
    // push credential by submitting a token they had learned.
    const owned = await DeviceToken.findOne({ token: cleanToken }).lean();
    if (owned && String(owned.user) !== String(req.user._id)) {
      return res.status(409).json({
        success: false,
        message: "This device token is registered to another account",
      });
    }

    const deviceToken = await DeviceToken.findOneAndUpdate(
      { user: req.user._id, token: cleanToken },
      {
        $set: {
          platform: platform || "unknown",
          isActive: true,
          lastUsedAt: new Date(),
        },
        $setOnInsert: { user: req.user._id, token: cleanToken },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "FCM token registered successfully",
      data: sanitizeDeviceToken(deviceToken),
    });
  } catch (error) {
    next(error);
  }
};

const removeDeviceToken = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    await DeviceToken.findOneAndUpdate(
      { user: req.user._id, token: token.trim() },
      { isActive: false }
    );

    return res.status(200).json({
      success: true,
      message: "FCM token removed successfully",
    });
  } catch (error) {
    next(error);
  }
};

const removeAllDeviceTokens = async (req, res, next) => {
  try {
    await DeviceToken.updateMany(
      { user: req.user._id, isActive: true },
      { isActive: false }
    );

    return res.status(200).json({
      success: true,
      message: "All FCM tokens removed successfully",
    });
  } catch (error) {
    next(error);
  }
};

const getMyDeviceTokens = async (req, res, next) => {
  try {
    const tokens = await DeviceToken.find({
      user: req.user._id,
      isActive: true,
    }).sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      data: tokens.map(sanitizeDeviceToken),
    });
  } catch (error) {
    next(error);
  }
};

const sendTestNotification = async (req, res, next) => {
  try {
    const { title = "Test Notification", body = "This notification was sent from the backend." } = req.body;

    const result = await sendNotificationToUser({
      userId: req.user._id,
      title,
      body,
      data: { type: "test" },
    });

    return res.status(200).json({
      success: true,
      message: "Notification processed",
      data: {
        ...result,
        results: (result.results || []).map((item) => ({
          ...item,
          token: maskToken(item.token),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerDeviceToken,
  removeDeviceToken,
  removeAllDeviceTokens,
  getMyDeviceTokens,
  sendTestNotification,
};