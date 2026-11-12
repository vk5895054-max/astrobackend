const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateHumanDesignCompatibility,
} = require("../services/humanDesignCompatibilityService");

const chart = ({ gates = [], channels = [], centers = [] } = {}) => ({
  type: "generator",
  typeLabel: "Generator",
  centers,
  gates: gates.map((number) => ({ number })),
  channels: channels.map((id) => ({ id })),
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

test("missing bodygraph data leaves the existing compatibility report unchanged", () => {
  assert.equal(calculateHumanDesignCompatibility(null, chart()), null);
  assert.equal(
    calculateHumanDesignCompatibility({ centers: [], gates: [] }, chart()),
    null,
  );
});
