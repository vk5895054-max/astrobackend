const mongoose = require("mongoose");

const PLANET_ENUM = [
  "Sun",
  "Earth",
  "Moon",
  "North Node",
  "South Node",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
];

const activationItemSchema = new mongoose.Schema(
  {
    planet: {
      type: String,
      enum: PLANET_ENUM,
      required: true,
    },
    symbol: { type: String },
    gate: {
      type: Number,
      min: 1,
      max: 64,
      required: true,
    },
    line: {
      type: Number,
      min: 1,
      max: 6,
      required: true,
    },
    color: { type: Number, min: 1, max: 6 },
    tone: { type: Number, min: 1, max: 6 },
    base: { type: Number, min: 1, max: 5 },
    gateLine: { type: String },
    longitude: { type: Number },
    sign: { type: String },
    center: { type: String },
    gateName: { type: String },
  },
  { _id: false }
);

const humanDesignChartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
    },
    birthDetails: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Basic About info
    type: {
      type: String,
      enum: ["manifestor", "generator", "manifestingGenerator", "projector", "reflector"],
      required: true,
    },
    typeLabel: {
      type: String,
      trim: true,
    },
    profile: {
      type: String,
      default: "unknown",
    },
    profileLabel: {
      type: String,
      trim: true,
    },
    authority: {
      type: String,
      required: true,
    },
    strategy: {
      type: String,
      required: true,
    },
    signature: {
      type: String,
      trim: true,
    },
    notSelfTheme: {
      type: String,
      default: "Frustration",
    },
    definition: {
      type: String,
      trim: true,
    },
    environment: {
      type: mongoose.Schema.Types.Mixed,
    },
    incarnationCross: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Centers (9 centers, defined/undefined)
    centers: [
      {
        name: {
          type: String,
          enum: [
            "Crown",
            "Ajna",
            "Throat",
            "G",
            "Heart/Ego",
            "Sacral",
            "Solar Plexus",
            "Spleen",
            "Root",
          ],
          required: true,
        },
        displayName: { type: String },
        shape: { type: String },
        defined: {
          type: Boolean,
          required: true,
        },
        statusLabel: { type: String },
        keywords: [String],
        keywordsText: { type: String },
        gates: [Number],
        activeGates: [Number],
        description: { type: String },
      },
    ],

    // Gates (active gates sorted numerically)
    gates: [
      {
        number: {
          type: Number,
          min: 1,
          max: 64,
        },
        label: { type: String },
        name: { type: String },
        keynote: { type: String },
        description: { type: String },
        center: { type: String },
        activation: {
          type: String,
          enum: ["personality", "design", "both"],
        },
        colorTheme: {
          type: String,
          enum: ["blue", "pink", "both"],
        },
        lines: [Number],
        activations: [mongoose.Schema.Types.Mixed],
        planets: [String],
      },
    ],

    // Defined Channels
    channels: [
      {
        id: { type: String },
        title: { type: String },
        name: { type: String },
        gates: [Number],
        centers: [String],
        activation: {
          type: String,
          enum: ["personality", "design", "both"],
        },
        description: { type: String },
        isLoveSection: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // Love insights ("Love for Type" section shown below Channels)
    love: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Structured tab views matching the mobile UI (About & BodyGraph)
    about: {
      type: mongoose.Schema.Types.Mixed,
    },
    bodyGraph: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Planet activations - Personality (conscious / blue)
    personality: [activationItemSchema],

    // Planet activations - Design (unconscious / pink)
    design: [activationItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("HumanDesignChart", humanDesignChartSchema);
