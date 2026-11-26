const test = require("node:test");
const assert = require("node:assert/strict");

const Match = require("../models/match");

test("consultation schema persists the call connection timestamp", () => {
  const path = Match.schema.path("consultation.callConnectedAt");
  assert.ok(path, "callConnectedAt must be declared so updates are not discarded");
  assert.equal(path.instance, "Date");

  const doc = new Match({
    userA: "68a000000000000000000001",
    userB: "68a000000000000000000002",
    requestedBy: "68a000000000000000000001",
    requestedTo: "68a000000000000000000002",
    matchType: "consultation",
    consultation: {
      channel: "voice",
      callConnectedAt: new Date("2026-11-26T10:00:00Z"),
    },
  });
  assert.equal(
    doc.toObject().consultation.callConnectedAt.toISOString(),
    "2026-11-26T10:00:00.000Z",
  );
});
