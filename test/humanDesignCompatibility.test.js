const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateHumanDesignCompatibility,
} = require("../services/humanDesignCompatibilityService");

const chart = ({
  type = "Generator",
  profile = "6/2",
  gates = [],
  channels = [],
  centers = [],
} = {}) => ({
  type: type.toLowerCase().replaceAll(" ", ""),
  typeLabel: type,
  profile,
  profileLabel: profile,
  centers,
  gates: gates.map((number) => ({ number })),
  channels: channels.map((id) => ({ id })),
});

test("returns heuristic type and profile ratings for the report", () => {
  const report = calculateHumanDesignCompatibility(
    chart({ type: "Projector", profile: "6/2" }),
    chart({ type: "Generator", profile: "3/5" }),
  );

  assert.deepEqual(report.ratings, {
    type: {
      score: 3,
      maxScore: 5,
      label: "Fair",
      method: "chart_similarity_heuristic",
    },
    profile: {
      score: 3,
      maxScore: 5,
      label: "Fair",
      method: "chart_similarity_heuristic",
    },
  });
});

test("shared type or profile lines receive a higher estimate", () => {
  const report = calculateHumanDesignCompatibility(
    chart({ type: "Generator", profile: "6/2" }),
    chart({ type: "Generator", profile: "3/6" }),
  );

  assert.equal(report.ratings.type.score, 4);
  assert.equal(report.ratings.profile.score, 4);
  assert.equal(report.ratings.type.label, "Good");
});

test("complementary active gates are reported as an electromagnetic channel", () => {
  const report = calculateHumanDesignCompatibility(
    chart({ gates: [1] }),
    chart({ gates: [8] }),
  );

  assert.equal(report.electromagneticChannels.length, 1);
  assert.deepEqual(report.electromagneticChannels[0], {
    id: "1-8",
    name: "Channel of Inspiration",
  });
  assert.match(report.summary, /complete 1 channel connection/);
});

test("shared channels and centers are included without duplicate completion claims", () => {
  const report = calculateHumanDesignCompatibility(
    chart({
      gates: [1, 8, 23],
      channels: ["1-8"],
      centers: [{ name: "G", defined: true }, { name: "Throat", defined: true }],
    }),
    chart({
      gates: [1, 8],
      channels: ["1-8"],
      centers: [{ name: "G", defined: true }],
    }),
  );

  assert.deepEqual(report.sharedChannels, ["1-8"]);
  assert.deepEqual(report.sharedCenters, ["G"]);
  assert.deepEqual(report.sharedGates, [1, 8]);
  assert.deepEqual(report.electromagneticChannels, []);
});

test("classifies compromise, dominant, resonant, and dissonant dynamics", () => {
  const report = calculateHumanDesignCompatibility(
    chart({
      gates: [1, 6, 8, 59],
      channels: ["1-8", "6-59"],
      centers: [
        { name: "G", defined: true },
        { name: "Throat", defined: true },
      ],
    }),
    chart({
      gates: [6],
      centers: [
        { name: "G", defined: true },
        { name: "Sacral", defined: true },
      ],
    }),
  );

  assert.deepEqual(report.compromiseChannels, [
    {
      id: "6-59",
      name: "Channel of Intimacy",
      definedBy: "personA",
      partnerGate: 6,
    },
  ]);
  assert.deepEqual(report.dominantChannels, [
    {
      id: "1-8",
      name: "Channel of Inspiration",
      definedBy: "personA",
    },
  ]);
  assert.deepEqual(report.resonantCenters, ["G"]);
  assert.deepEqual(report.dissonantCenters, [
    { name: "Sacral", definedBy: "personB" },
    { name: "Throat", definedBy: "personA" },
  ]);
});

test("missing bodygraph data leaves the existing compatibility report unchanged", () => {
  assert.equal(calculateHumanDesignCompatibility(null, chart()), null);
  assert.equal(
    calculateHumanDesignCompatibility({ centers: [], gates: [] }, chart()),
    null,
  );
});
