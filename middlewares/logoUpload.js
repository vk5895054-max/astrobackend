const multer = require("multer");

// A single logo file per review request. 8 MB is generous enough for a PNG
// export while keeping the inline Gemini request small.
const uploadLogoImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    // The vision model used for logo reviews accepts these formats natively.
    // HEIC uploads previously passed this filter only to fail at the provider.
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return callback(
        new Error("Only JPEG, PNG, or WebP images are allowed"),
      );
    }
    callback(null, true);
  },
}).single("logo");

module.exports = { uploadLogoImage };
