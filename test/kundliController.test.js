const test = require("node:test");
const assert = require("node:assert/strict");
const kundliRoutes = require("../routes/kundliRoutes");
const {
  calculateKundli,
  calculateLalKitabVarshaPhal,
  getCategories,
} = require("../controllers/kundliController");

const requestBody = {
  name: "Aisha",
  dateOfBirth: "1995-04-12",
  timeOfBirth: "15:56:00",
  place: "Agra, Uttar Pradesh, India",
  gender: "Female",
  latitude: 27.1767,
  longitude: 78.0081,
  timeZoneOffsetMinutes: 330,
  save: false,
  category: "all",
};

test("Kundli router exposes the app's calculate, saved-chart, and chat paths", () => {
  const routes = kundliRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  assert.ok(
    routes.some(
      (route) => route.path === "/calculate" && route.methods.includes("post"),
    ),
  );
  assert.ok(
    routes.some(
      (route) =>
        route.path === "/lal-kitab-varsha-phal" && route.methods.includes("post"),
    ),
  );
  assert.ok(
    routes.some(
      (route) => route.path === "/my-kundli" && route.methods.includes("get"),
    ),
  );
  assert.ok(
    routes.some(
      (route) => route.path === "/chat" && route.methods.includes("post"),
    ),
  );
  assert.ok(
    routes.some(
      (route) =>
        route.path === "/saved-kundlis" && route.methods.includes("get"),
    ),
  );
  assert.ok(
    routes.some(
      (route) =>
        route.path === "/saved-matches" && route.methods.includes("get"),
    ),
  );
  assert.ok(
    routes.some(
      (route) =>
        route.path === "/saved-matches" && route.methods.includes("post"),
    ),
  );
});

test("calculate accepts the Flutter birth-details payload and returns chart data", async () => {
  let status = 200;
  let payload;
  const res = {
    status(code) {
      status = code;
      return res;
    },
    json(data) {
      payload = data;
      return res;
    },
  };

  await calculateKundli({ body: requestBody, query: {} }, res, (error) => {
    throw error;
  });

  assert.equal(status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.data.summary.name, "Aisha");
  assert.equal(payload.data.summary.totalCategories, 34);
  assert.equal(payload.data.navigation.length, 34);
  assert.equal(
    payload.data.navigation.some((item) => item.key === "lagna"),
    true,
  );
  for (const key of [
    "nakshatra_nadi",
    "chandra_kala_nadi",
    "lal_kitab",
    "tri_bhagi_dasha",
    "lal_kitab_dasha",
    "cil_sub_sub",
    "predictions",
    "varsha_kundli",
  ]) {
    assert.ok(
      payload.data.navigation.some((item) => item.key === key),
      `${key} should be included in Kundli AI navigation`,
    );
  }
  assert.equal(payload.data.categories.lagna.houses.length, 12);
  assert.ok(payload.data.categories.ashtakvarga);
  assert.ok(payload.data.categories.shad_bala);
  assert.ok(payload.data.categories.ask_questions);
  assert.ok(payload.data.categories.nakshatra_nadi);
  assert.ok(payload.data.categories.chandra_kala_nadi);
  assert.ok(payload.data.categories.lal_kitab);
  assert.ok(payload.data.categories.tri_bhagi_dasha);
  assert.equal(
    payload.data.categories.nakshatra_nadi.planetSignifications.length,
    9,
  );
  assert.equal(payload.data.categories.cil_sub_sub.rows.length, 9);
  assert.ok(payload.data.categories.lal_kitab_dasha.periods.length > 0);
  assert.equal(payload.data.categories.predictions.planetaryReadings.length, 9);
  assert.equal(payload.data.categories.varsha_kundli.houses.length, 12);
});

test("Lal Kitab Varshphal calculates an annual chart for the requested year", async () => {
  let status = 200;
  let payload;
  const res = {
    status(code) {
      status = code;
      return res;
    },
    json(data) {
      payload = data;
      return res;
    },
  };

  await calculateLalKitabVarshaPhal({
    body: { ...requestBody, year: 2026 },
  }, res, (error) => {
    throw error;
  });

  assert.equal(status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.data.year, 2026);
  assert.match(payload.data.startDate, /^2026-/);
  assert.equal(payload.data.chart.houses.length, 12);
  assert.ok(payload.data.ascendantSign);
  assert.ok(payload.data.ascendantLord);
  assert.ok(payload.data.planetPositions.Sun);
  assert.ok(payload.data.predictions.length > 0);
  assert.ok(payload.data.remedies.length > 0);
});

test("Lal Kitab Varshphal rejects a year before the birth year", async () => {
  let status = 200;
  let payload;
  const res = {
    status(code) {
      status = code;
      return res;
    },
    json(data) {
      payload = data;
      return res;
    },
  };

  await calculateLalKitabVarshaPhal({
    body: { ...requestBody, year: 1994 },
  }, res, (error) => {
    throw error;
  });

  assert.equal(status, 400);
  assert.equal(payload.success, false);
  assert.match(payload.message, /year must be an integer/);
});

test("category catalog includes the added Kundli AI reports", () => {
  let payload;
  const res = {
    status(code) {
      assert.equal(code, 200);
      return res;
    },
    json(data) {
      payload = data;
      return res;
    },
  };

  getCategories({}, res);

  assert.equal(payload.data.totalCategories, 34);
  for (const key of [
    "nakshatra_nadi",
    "chandra_kala_nadi",
    "lal_kitab",
    "tri_bhagi_dasha",
    "lal_kitab_dasha",
    "cil_sub_sub",
    "predictions",
    "varsha_kundli",
  ]) {
    assert.ok(
      payload.data.categories.some((category) => category.key === key),
      `${key} should be included in the category catalog`,
    );
  }
});
