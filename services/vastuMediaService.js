const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { cloudinary } = require("../config/cloudinary");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads", "vastu");

const EXTENSION_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/3gpp": ".3gp",
  "video/x-m4v": ".m4v",
};

const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
);

const safeName = (file, kind) => {
  const extension =
    EXTENSION_BY_MIME[file.mimetype] ||
    path.extname(file.originalname || "").toLowerCase() ||
    "";
  const random = crypto.randomBytes(6).toString("hex");
  return `${kind}-${Date.now()}-${random}${extension}`;
};

const uploadToCloudinary = (file, { userId, kind }) =>
  new Promise((resolve, reject) => {
    const isVideo = String(file.mimetype).startsWith("video/");
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `astro/vastu/${userId}`,
        resource_type: isVideo ? "video" : "image",
        public_id: `${kind}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        // Vastu photos are evidence for a human reviewer: keep enough detail to
        // read a floor plan or identify a room, without storing full originals.
        transformation: isVideo
          ? [{ quality: "auto" }]
          : [{ width: 2200, height: 2200, crop: "limit", quality: "auto" }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url || result.url,
          publicId: result.public_id,
          provider: "cloudinary",
          mimeType: file.mimetype,
          size: file.size || null,
        });
      },
    );
    stream.end(file.buffer);
  });

const uploadToLocalDisk = async (file, { userId, kind }) => {
  const directory = path.join(UPLOAD_ROOT, String(userId));
  await fs.mkdir(directory, { recursive: true });
  const filename = safeName(file, kind);
  await fs.writeFile(path.join(directory, filename), file.buffer);
  return {
    url: `/uploads/vastu/${userId}/${filename}`,
    publicId: "",
    provider: "local",
    mimeType: file.mimetype,
    size: file.size || null,
  };
};

const persistOne = async (file, options) => {
  if (cloudinaryConfigured) {
    try {
      return await uploadToCloudinary(file, options);
    } catch (error) {
      console.warn(
        "[Vastu] Cloudinary upload failed, falling back to local disk:",
        error.message,
      );
    }
  }
  return uploadToLocalDisk(file, options);
};

/**
 * Persists one submission's uploaded files.
 *
 * `files` is multer's `.fields()` object:
 *   { floorPlan: [file], photos: [file], video: [file] }
 *
 * Storage order: Cloudinary when configured, otherwise local disk under
 * /uploads/vastu/<userId>. The returned URLs are what the mobile app and the
 * admin panel store/read.
 */
const persistVastuUploads = async (files = {}, userId) => {
  const result = {
    floorPlanUrl: "",
    floorPlanPublicId: "",
    floorPlanProvider: "",
    photoUrls: [],
    photoPublicIds: [],
    videoUrl: "",
    videoPublicId: "",
    videoProvider: "",
  };

  const floorPlan = files.floorPlan?.[0];
  if (floorPlan) {
    const stored = await persistOne(floorPlan, { userId, kind: "floor-plan" });
    result.floorPlanUrl = stored.url;
    result.floorPlanPublicId = stored.publicId;
    result.floorPlanProvider = stored.provider;
  }

  for (const photo of files.photos || []) {
    const stored = await persistOne(photo, { userId, kind: "photo" });
    result.photoUrls.push(stored.url);
    if (stored.publicId) result.photoPublicIds.push(stored.publicId);
  }

  const video = files.video?.[0];
  if (video) {
    const stored = await persistOne(video, { userId, kind: "walkthrough" });
    result.videoUrl = stored.url;
    result.videoPublicId = stored.publicId;
    result.videoProvider = stored.provider;
  }

  return result;
};

const deleteVastuMedia = async ({ publicId, provider }) => {
  if (!publicId) return { deleted: false };
  if (provider === "cloudinary" && cloudinaryConfigured) {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" }).catch(() => {});
    return { deleted: true };
  }
  return { deleted: false };
};

module.exports = {
  persistVastuUploads,
  deleteVastuMedia,
  UPLOAD_ROOT,
};
