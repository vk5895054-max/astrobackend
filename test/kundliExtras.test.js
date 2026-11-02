const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NAKSHATRA_NADI,
  NADI_ORDER,
  getNakshatraNadiReport,
  getChandraKalaNadiReport,
} = require("../services/nadiService");
const { buildLalKitabReport, PLANET_ORDER } = require("../services/lalKitabService");
const { getTribhagiTimeline, NAKSHATRA_LORDS } = require("../services/dashaService");
const { calculateFullKundli } = require("../services/kundliCalculationService");

// --- Nakshatra Nadi -------------------------------------------------------

test("nakshatra nadi report groups all 27 nakshatras into three nadis", () => {
  const report = getNakshatraNadiReport({
    moonNakshatra: { name: "Purva Phalguni", index: 10, pada: 2 },
    moonRashi: "Leo",
    ascRashi: "Leo",
  });

  assert.equal(report.title, "Nakshatra Nadi");
  assert.equal(report.moon.nadi, "Madhya");
  assert.equal(report.native.prakriti, "Pitta (Fire)");
  assert.equal(report.nadis.length, 3);

  const total = report.nadis.reduce((sum, nadi) => sum + nadi.nakshatraCount, 0);
  assert.equal(total, 27);
  for (const nadi of report.nadis) {
    assert.equal(nadi.nakshatraCount, 9);
    assert.ok(nadi.remedies.length > 0, `${nadi.nadi} needs remedies`);
    assert.ok(nadi.traits.length > 0);
  }

  assert.equal(report.nakshatraTable.length, 27);
  const moonRow = report.nakshatraTable.find((row) => row.isMoonNakshatra);
  assert.equal(moonRow.nakshatra, "Purva Phalguni");
  assert.equal(moonRow.nadi, "Madhya");
  assert.equal(moonRow.nakshatraLord, "Venus");
});

test("nakshatra nadi rotation matches the Avakhada / Guna Milan order", () => {
  assert.equal(NAKSHATRA_NADI.length, 27);
  assert.equal(NAKSHATRA_NADI[0], "Adi"); // Ashwini
  assert.equal(NAKSHATRA_NADI[2], "Antya"); // Krittika
  assert.deepEqual(NADI_ORDER, ["Adi", "Madhya", "Antya"]);
});

// --- Chandra Kala Nadi ----------------------------------------------------

test("chandra kala nadi locates the Moon inside a 150-amsha rashi", () => {
  // 5° Aries -> nadi amsha 26 (0.2° each), inside the Adi band (0-10°).
  const early = getChandraKalaNadiReport({ moonLon: 5, moonRashi: "Aries" });
  assert.equal(early.nadiAmsha.index, 26);
  assert.equal(early.nadiAmsha.total, 150);
  assert.equal(early.nadiAmsha.bhaga, "Poorvabhaga");
  assert.equal(early.nadiAmsha.nadi, "Adi Nadi");
  assert.equal(early.moon.rashi, "Aries");
  assert.equal(early.moon.rashiLord, "Mars");

  // 25° Aries -> nadi amsha 126, inside the Antya band (20-30°).
  const late = getChandraKalaNadiReport({ moonLon: 25, moonRashi: "Aries" });
  assert.equal(late.nadiAmsha.index, 126);
  assert.equal(late.nadiAmsha.nadi, "Antya Nadi");
  assert.equal(late.nadiAmsha.bhaga, "Poorvabhaga");

  assert.equal(early.bands.length, 3);
  assert.deepEqual(
    early.bands.map((band) => band.amshas),
    ["1-50", "51-100", "101-150"],
  );
  assert.equal(early.bands.filter((band) => band.isActive).length, 1);
  assert.ok(early.interpretation.mind.length > 0);
  assert.ok(early.interpretation.remedy.length > 0);
});

test("chandra kala nadi splits an amsha into Poorva and Uttara bhaga", () => {
  // 0.05° lies in the first half of amsha 1; 0.15° in the second half.
  const poorva = getChandraKalaNadiReport({ moonLon: 0.05, moonRashi: "Aries" });
  const uttara = getChandraKalaNadiReport({ moonLon: 0.15, moonRashi: "Aries" });
  assert.equal(poorva.nadiAmsha.index, 1);
  assert.equal(poorva.nadiAmsha.bhaga, "Poorvabhaga");
  assert.equal(uttara.nadiAmsha.index, 1);
  assert.equal(uttara.nadiAmsha.bhaga, "Uttarabhaga");
});

// --- Lal Kitab ------------------------------------------------------------

test("lal kitab report reads every planet from its house", () => {
  const planets = {};
  PLANET_ORDER.forEach((name, i) => {
    planets[name] = {
      house: (i % 12) + 1,
      rashi: "Aries",
      retrograde: false,
      isExalted: false,
      isDebilitated: false,
      isOwnSign: false,
    };
  });

  const report = buildLalKitabReport({ planets });
  assert.equal(report.title, "Lal Kitab");
  assert.equal(report.planets.length, PLANET_ORDER.length);
  assert.equal(report.houseRemedies.length, 12);
  assert.ok(report.generalRules.length >= 5);

  for (const entry of report.planets) {
    assert.ok(entry.house >= 1 && entry.house <= 12);
    assert.match(entry.prediction, /house/);
    assert.ok(entry.remedy.length > 0, `${entry.planet} needs a remedy`);
    assert.ok(entry.avoid.length > 0, `${entry.planet} needs a rule to avoid`);
    assert.ok(entry.houseCharity.length > 0);
  }
});

test("lal kitab report degrades gracefully without planets", () => {
  const report = buildLalKitabReport({ planets: {} });
  assert.equal(report.planets.length, 0);
  assert.equal(report.houseRemedies.length, 12);
});

// --- Tri Bhagi Dasha ------------------------------------------------------

const birthDate = new Date(Date.UTC(1995, 3, 12, 10, 26));
const moonLon = 137.8061; // Purva Phalguni 2, Venus-ruled

test("tri bhagi splits every mahadasha into its lord's three nakshatras", () => {
  const timeline = getTribhagiTimeline({
    moonSiderealLongitude: moonLon,
    birthDate,
    atDate: new Date(Date.UTC(2026, 10, 2)),
  });

  assert.ok(timeline.method.includes("three equal bhagis"));
  assert.ok(timeline.mahadashas.length > 0);

  for (const mahadasha of timeline.mahadashas) {
    assert.equal(mahadasha.bhagis.length, 3);
    const days = mahadasha.bhagis.reduce((sum, bhagi) => sum + bhagi.days, 0);
    assert.ok(Math.abs(days - mahadasha.days) < 0.05, "bhagis sum to the mahadasha");
    for (const bhagi of mahadasha.bhagis) {
      assert.equal(bhagi.lord, mahadasha.planet);
      assert.equal(NAKSHATRA_LORDS[bhagi.nakshatraIndex], mahadasha.planet);
      assert.ok(bhagi.years > 0);
      assert.ok(bhagi.start < bhagi.end);
    }
    // Zodiacal order: the three nakshatra indices increase.
    const indices = mahadasha.bhagis.map((bhagi) => bhagi.nakshatraIndex);
    assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
  }

  assert.ok(timeline.current, "a current bhagi exists for today");
  assert.ok(timeline.current.bhagi);
});

test("tri bhagi keeps the 120-year Vimshottari span across the three parts", () => {
  const timeline = getTribhagiTimeline({
    moonSiderealLongitude: moonLon,
    birthDate,
    atDate: birthDate,
    mahadashaCount: 9,
  });
  const totalYears = timeline.mahadashas.reduce((sum, m) => sum + m.years, 0);
  // First mahadasha is the birth balance, so the sum is under 120 but the
  // full mahadasha lengths (Venus 20, Sun 6, ...) still hold per period.
  assert.ok(totalYears > 100 && totalYears < 120);
  const venus = timeline.mahadashas.find((m) => m.planet === "Venus");
  assert.ok(Math.abs(venus.bhagis[0].years - venus.years / 3) < 0.01);
});

// --- Full kundli wiring ---------------------------------------------------

test("calculateFullKundli exposes Kundli AI report categories and chart data", async () => {
  const result = await calculateFullKundli({
    name: "Aisha",
    dateOfBirth: "1995-04-12",
    timeOfBirth: "15:56:00",
    place: "Agra",
    latitude: 27.1767,
    longitude: 78.0081,
    timeZoneOffsetMinutes: 330,
  });

  assert.equal(result.summary.totalCategories, 34);
  assert.equal(result.navigation.length, 34);

  for (const key of ["nakshatra_nadi", "chandra_kala_nadi", "lal_kitab", "tri_bhagi_dasha"]) {
    assert.ok(result.categories[key], `${key} payload missing`);
    const nav = result.navigation.find((item) => item.key === key);
    assert.ok(nav, `${key} missing from navigation`);
    assert.ok(nav.title.length > 0);
  }

  const quick = result.categories.basic.quickCategories.map((item) => item.id);
  assert.ok(quick.includes("lal_kitab"));
  assert.ok(quick.includes("nakshatra_nadi"));
  assert.ok(quick.includes("chandra_kala_nadi"));
  assert.ok(quick.includes("tri_bhagi_dasha"));

  const supported = result.categories.ask_questions.chat.supportedCategories;
  assert.ok(supported.includes("Lal Kitab"));
  assert.ok(supported.includes("Tri Bhagi Dasha"));

  assert.equal(result.categories.nakshatra_nadi.planetSignifications.length, 9);
  assert.equal(result.categories.cil_sub_sub.rows.length, 9);
  assert.ok(result.categories.lal_kitab_dasha.periods.length > 0);
  assert.equal(result.categories.predictions.planetaryReadings.length, 9);
  assert.equal(result.categories.varsha_kundli.houses.length, 12);
});
