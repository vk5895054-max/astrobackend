const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateFullKundli } = require("../services/kundliCalculationService");
const { calculateNatalChart } = require("../services/astrologyService");

test("a Kundli without birth time does not invent an Aries Lagna", async () => {
  const chart = await calculateFullKundli({
    name: "Test",
    dateOfBirth: "1995-04-12",
    // No time and no coordinates: the ephemeris has no Ascendant.
  });

  assert.equal(chart.summary.lagna, null);
  assert.equal(chart.summary.mangalDosh, null);
  assert.equal(chart.summary.ascendantAvailable, false);
  assert.equal(chart.summary.timeOfBirthProvided, false);
  assert.equal(chart.summary.precision, "no-birth-time");
  assert.match(chart.summary.note, /accurate birth time/i);
});

test("a complete Kundli still reports its computed Lagna", async () => {
  const chart = await calculateFullKundli({
    name: "Test",
    dateOfBirth: "1995-04-12",
    timeOfBirth: "15:56:00",
    place: "Agra",
    latitude: 27.1767,
    longitude: 78.0081,
    timeZoneOffsetMinutes: 330,
  });

  assert.equal(chart.summary.ascendantAvailable, true);
  assert.equal(chart.summary.precision, "full");
  assert.ok(chart.summary.lagna);
  assert.notEqual(chart.summary.lagna, null);
});

test("an invalid birth time is not reported as a known birth time", () => {
  const chart = calculateNatalChart({
    dateOfBirth: "1995-04-12",
    timeOfBirth: "not-a-time",
    timeZoneOffsetMinutes: 330,
  });
  assert.equal(chart.precision, "date-only-estimate");
});
