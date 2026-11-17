const mongoose = require("mongoose");
const {
  PROPERTY_TYPES,
  DIRECTIONS,
  PLOT_SHAPES,
  ROAD_TYPES,
  AREA_UNITS,
  REQUEST_STATUSES,
} = require("../services/vastuRulesEngine");

const directionEnum = ["", ...DIRECTIONS];

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: REQUEST_STATUSES, required: true },
    note: { type: String, trim: true, maxlength: 1000, default: "" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    role: { type: String, enum: ["user", "astrologer", "admin", "system"], default: "system" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const missingInfoSchema = new mongoose.Schema(
  {
    field: { type: String, required: true, trim: true, maxlength: 120 },
    label: { type: String, trim: true, maxlength: 160, default: "" },
    reason: { type: String, trim: true, maxlength: 1000, default: "" },
    status: {
      type: String,
      enum: ["open", "provided", "waived"],
      default: "open",
    },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    requestedAt: { type: Date, default: Date.now },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
    value: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { _id: true },
);

const verificationSchema = new mongoose.Schema(
  {
    addressVerified: { type: Boolean, default: false },
    directionsVerified: { type: Boolean, default: false },
    mediaVerified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },
    note: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { _id: false },
);

const vastuRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Submitted → Pending Review → Under Review → Analysis in Progress →
    // Report Ready → Completed, with More Information Required available from
    // the review stages. See STATUS_TRANSITIONS in vastuRulesEngine.js.
    status: {
      type: String,
      enum: REQUEST_STATUSES,
      default: "pending_review",
      index: true,
    },

    property: {
      propertyType: { type: String, enum: PROPERTY_TYPES, default: "" },
      houseFacing: { type: String, enum: directionEnum, default: "" },
      entranceDirection: { type: String, enum: directionEnum, default: "" },
      entrancePosition: { type: String, enum: directionEnum, default: "" },
      totalFloors: { type: Number, min: 0, max: 200, default: null },
      bedrooms: { type: Number, min: 0, max: 100, default: null },
      bathrooms: { type: Number, min: 0, max: 100, default: null },
      kitchenDirection: { type: String, enum: directionEnum, default: "" },
      masterBedroomDirection: { type: String, enum: directionEnum, default: "" },
      bedroomDirections: { type: [{ type: String, enum: DIRECTIONS }], default: [] },
      bathroomDirection: { type: String, enum: directionEnum, default: "" },
      toiletDirection: { type: String, enum: directionEnum, default: "" },
      prayerRoomDirection: { type: String, enum: directionEnum, default: "" },
      staircaseDirection: { type: String, enum: directionEnum, default: "" },
      waterTankDirection: { type: String, enum: directionEnum, default: "" },
      overheadTankDirection: { type: String, enum: directionEnum, default: "" },
      septicTankDirection: { type: String, enum: directionEnum, default: "" },
      plotShape: { type: String, enum: ["", ...PLOT_SHAPES], default: "" },
      plotFacing: { type: String, enum: directionEnum, default: "" },
      plotArea: { type: Number, min: 0, max: 100000000, default: null },
      areaUnit: { type: String, enum: ["", ...AREA_UNITS], default: "" },
      roadSide: { type: String, enum: directionEnum, default: "" },
      roadType: { type: String, enum: ["", ...ROAD_TYPES], default: "" },
      intersectionPosition: { type: String, enum: directionEnum, default: "" },
      surroundingContext: { type: String, trim: true, maxlength: 2000, default: "" },
    },

    address: {
      line: { type: String, trim: true, maxlength: 500, default: "" },
      city: { type: String, trim: true, maxlength: 120, default: "" },
      state: { type: String, trim: true, maxlength: 120, default: "" },
      pincode: { type: String, trim: true, maxlength: 20, default: "" },
      country: { type: String, trim: true, maxlength: 120, default: "India" },
      mapsUrl: { type: String, trim: true, maxlength: 2000, default: "" },
      placeId: { type: String, trim: true, maxlength: 300, default: "" },
      latitude: { type: Number, min: -90, max: 90, default: null },
      longitude: { type: Number, min: -180, max: 180, default: null },
      source: {
        type: String,
        enum: ["manual", "google_maps_link", "places_search", "map_pin"],
        default: "manual",
      },
      contextNotes: { type: String, trim: true, maxlength: 2000, default: "" },
    },

    media: {
      floorPlanUrl: { type: String, trim: true, maxlength: 2000, default: "" },
      floorPlanPublicId: { type: String, trim: true, maxlength: 500, default: "" },
      floorPlanProvider: { type: String, enum: ["", "cloudinary", "local"], default: "" },
      photoUrls: { type: [String], default: [] },
      photoPublicIds: { type: [String], default: [] },
      videoUrl: { type: String, trim: true, maxlength: 2000, default: "" },
      videoPublicId: { type: String, trim: true, maxlength: 500, default: "" },
      videoProvider: { type: String, enum: ["", "cloudinary", "local"], default: "" },
    },

    birthDetails: {
      dateOfBirth: { type: Date, default: null },
      timeOfBirth: { type: String, trim: true, maxlength: 20, default: "" },
      placeOfBirth: { type: String, trim: true, maxlength: 200, default: "" },
      latitude: { type: Number, min: -90, max: 90, default: null },
      longitude: { type: Number, min: -180, max: 180, default: null },
      timeZoneOffsetMinutes: { type: Number, min: -840, max: 840, default: 0 },
      moonSign: { type: String, trim: true, maxlength: 40, default: "" },
      ascendantSign: { type: String, trim: true, maxlength: 40, default: "" },
    },

    concern: { type: String, trim: true, maxlength: 3000, default: "" },
    language: { type: String, trim: true, maxlength: 20, default: "en" },

    missingInfo: { type: [missingInfoSchema], default: [] },
    verification: { type: verificationSchema, default: () => ({}) },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    assignedAt: { type: Date, default: null },
    reviewStartedAt: { type: Date, default: null },
    report: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VastuReport",
      default: null,
    },

    statusHistory: { type: [statusHistorySchema], default: [] },
    submittedAt: { type: Date, default: Date.now },
    lastActionAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

vastuRequestSchema.index({ user: 1, createdAt: -1 });
vastuRequestSchema.index({ status: 1, createdAt: -1 });
vastuRequestSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("VastuRequest", vastuRequestSchema);
