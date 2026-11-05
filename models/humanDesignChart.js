const humanDesignChartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // Basic info
  type: {
    type: String,
    enum: ["manifestor", "generator", "manifestingGenerator", "projector", "reflector"],
    required: true,
  },
  profile: {
    type: String,
    default: "unknown",
  },
  authority: {
    type: String,
    required: true,
  },
  strategy: {
    type: String,
    required: true,
  },
  notSelfTheme: {
    type: String,
    default: "Frustration",
  },

  // Centers (9 centers, defined/undefined)
  centers: [
    {
      name: {
        type: String,
        enum: [
          "Crown", "Ajna", "Throat", "G", "Heart/Ego",
          "Sacral", "Solar Plexus", "Spleen", "Root",
        ],
        required: true,
      },
      defined: {
        type: Boolean,
        required: true,
      },
      keywords: [String],
    ],
  ],

  // Gates (active gates)
  gates: [
    {
      number: {
        type: Number,
        min: 1,
        max: 64,
      },
      name: {
        type: String,
      },
    },
  ],

  // Channels
  channels: [
    {
      id: {
        type: String,
      },
      name: {
        type: String,
      },
      isLoveSection: {
        type: Boolean,
        default: false,
      },
    },
  ],

  // Planet activations - Personality (conscious)
  personality: [
    {
      planet: {
        type: String,
        enum: ["Sun", "Earth", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"],
      },
      gate: {
        type: Number,
        min: 1,
        max: 64,
      },
      line: {
        type: Number,
        min: 1,
        max: 6,
      },
    },
  ],

  // Planet activations - Design (unconscious)
  design: [
    {
      planet: {
        type: String,
        enum: ["Sun", "Earth", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"],
      },
      gate: {
        type: Number,
        min: 1,
        max: 64,
      },
      line: {
        type: Number,
        min: 1,
        max: 6,
      },
    },
  ],

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("HumanDesignChart", humanDesignChartSchema);
