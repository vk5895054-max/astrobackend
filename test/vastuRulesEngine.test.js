const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DIRECTIONS,
  DEFAULT_TEMPLATE_SECTIONS,
  DISCLAIMER,
  canTransition,
  normalizeDirection,
  normalizePropertyInput,
  normalizeBirthDetails,
  normalizeConcern,
  validateConditions,
  evaluateConditions,
  evaluateRules,
  buildReportData,
  buildElementBalance,
  computeScore,
  verdictFor,
  FIELD_REGISTRY,
} = require("../services/vastuRulesEngine");
const { buildVastuReportPdf } = require("../services/vastuReportPdf");
const { extractAddress, extractPropertyInput, extractBirthDetails } = require("../services/vastuWorkflowService");
const defaultRules = require("../data/vastuRules.json");

const property = {
  propertyType: "house",
  houseFacing: "north",
  entranceDirection: "north-east",
  kitchenDirection: "south-east",
  masterBedroomDirection: "south-west",
  bathroomDirection: "north-west",
  prayerRoomDirection: "north-east",
  staircaseDirection: "south-west",
  plotShape: "square",
  roadType: "straight",
};

test("every bundled default rule has valid, safe conditions", () => {
  assert.ok(defaultRules.length >= 40, "expected a substantial default rule set");
  const codes = new Set();
  for (const rule of defaultRules) {
    const check = validateConditions(rule.conditions);
    assert.equal(check.valid, true, `${rule.code}: ${check.errors.join(" ")}`);
    assert.match(rule.code, /^[a-z0-9][a-z0-9-_]{2,80}$/);
    assert.ok(rule.title, `${rule.code} needs a title`);
    assert.ok(rule.explanation, `${rule.code} needs an explanation`);
    assert.ok(["low", "moderate", "high"].includes(rule.concern), `${rule.code} concern`);
    assert.ok(!codes.has(rule.code), `duplicate rule code ${rule.code}`);
    codes.add(rule.code);
  }
});

test("directions accept English, abbreviated and Hindi aliases", () => {
  const cases = {
    N: "north",
    "north east": "north-east",
    NE: "north-east",
    ishan: "north-east",
    "South-West": "south-west",
    nairutya: "south-west",
    paschim: "west",
    brahmasthan: "centre",
    center: "centre",
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(normalizeDirection(input), expected, input);
  }
  assert.equal(normalizeDirection("banana"), "");
  assert.equal(normalizeDirection(null), "");
});

test("property input normalisation coerces types and reports bad values", () => {
  const good = normalizePropertyInput({
    propertyType: "Independent Bungalow",
    houseFacing: "NE",
    totalFloors: "2",
    bedrooms: 3,
    plotArea: "1200",
    areaUnit: "sq ft",
    plotShape: "triangular plot",
    roadType: "T junction",
    bedroomDirections: "south-west, west / south-west",
    surroundingContext: "  Park on the north side  ",
  });
  assert.deepEqual(good.errors, []);
  assert.equal(good.value.propertyType, "house");
  assert.equal(good.value.houseFacing, "north-east");
  assert.equal(good.value.totalFloors, 2);
  assert.equal(good.value.plotArea, 1200);
  assert.equal(good.value.areaUnit, "sqft");
  assert.equal(good.value.plotShape, "triangular");
  assert.equal(good.value.roadType, "t_junction");
  assert.deepEqual(good.value.bedroomDirections, ["south-west", "west"]);
  assert.equal(good.value.surroundingContext, "Park on the north side");

  const bad = normalizePropertyInput({
    houseFacing: "upward",
    totalFloors: "many",
    propertyType: "castle",
    plotShape: "hexagonal",
  });
  assert.deepEqual(
    bad.errors.map((item) => item.field).sort(),
    ["houseFacing", "plotShape", "propertyType", "totalFloors"],
  );
});

test("concern levels normalise and keep the app severity aliases", () => {
  assert.equal(normalizeConcern("HIGH"), "high");
  assert.equal(normalizeConcern("medium"), "moderate");
  assert.equal(normalizeConcern("mild"), "low");
  assert.equal(normalizeConcern("nonsense"), "moderate");
});

test("birth details normalise dates, coordinates and zodiac aliases", () => {
  const result = normalizeBirthDetails({
    dateOfBirth: "1992-04-18",
    timeOfBirth: "06:45",
    placeOfBirth: "Jaipur",
    latitude: "26.9124",
    longitude: "75.7873",
    timeZoneOffsetMinutes: 330,
    moonSign: "Vrishchik",
    ascendantSign: "Simha",
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.dateOfBirth.toISOString().slice(0, 10), "1992-04-18");
  assert.equal(result.value.latitude, 26.9124);
  assert.equal(result.value.moonSign, "scorpio");
  assert.equal(result.value.ascendantSign, "leo");

  assert.equal(normalizeBirthDetails({ latitude: 99 }).errors[0].field, "latitude");
  assert.equal(normalizeBirthDetails({ dateOfBirth: "not-a-date" }).errors[0].field, "dateOfBirth");
});

test("condition validation rejects unsafe or malformed trees", () => {
  assert.equal(validateConditions({ all: [{ field: "kitchenDirection", op: "eq", value: "south-east" }] }).valid, true);
  assert.equal(validateConditions(undefined).valid, false);
  assert.equal(validateConditions({}).valid, false);
  assert.equal(validateConditions({ all: [] }).valid, false);
  assert.equal(validateConditions({ all: [{ field: "kitchenDirection", op: "run_shell", value: "x" }] }).valid, false);
  assert.equal(validateConditions({ all: [{ field: "unknownField", op: "eq", value: "x" }] }).valid, false);
  assert.equal(validateConditions({ all: [{ field: "houseFacing", op: "eq", value: "up" }] }).valid, false);
  assert.equal(validateConditions({ all: [{ field: "totalFloors", op: "between", value: [2] }] }).valid, false);
  assert.equal(validateConditions({ all: [{ field: "totalFloors", op: "between", value: [2, 5] }] }).valid, true);
  assert.equal(validateConditions({ any: [{ field: "roadType", op: "in", value: "straight" }] }).valid, false);
});

test("condition evaluation supports all/any/none, field comparison and numbers", () => {
  const context = {
    kitchenDirection: "north-east",
    entranceDirection: "north-east",
    totalFloors: 3,
    roadType: "t_junction",
    _derived: { centreOccupied: false, missingElementCount: 0, hasBirthDetails: false },
  };

  assert.equal(
    evaluateConditions({ all: [{ field: "kitchenDirection", op: "eq", value: "north-east" }] }, context).status,
    "matched",
  );
  assert.equal(
    evaluateConditions({ all: [{ field: "kitchenDirection", op: "neq", value: "south-east" }] }, context).status,
    "matched",
  );
  assert.equal(
    evaluateConditions({ all: [{ field: "entranceDirection", op: "eq_field", value: "kitchenDirection" }] }, context)
      .status,
    "matched",
  );
  assert.equal(
    evaluateConditions({ all: [{ field: "roadType", op: "in", value: ["t_junction", "dead_end"] }] }, context).status,
    "matched",
  );
  assert.equal(
    evaluateConditions({ none: [{ field: "roadType", op: "eq", value: "corner" }] }, context).status,
    "matched",
  );
  assert.equal(
    evaluateConditions({ all: [{ field: "totalFloors", op: "between", value: [2, 3] }] }, context).status,
    "matched",
  );
  assert.equal(
    evaluateConditions({ all: [{ field: "totalFloors", op: "gt", value: 5 }] }, context).status,
    "not_matched",
  );
  assert.equal(
    evaluateConditions({ any: [{ field: "roadType", op: "eq", value: "corner" }, { field: "totalFloors", op: "eq", value: 3 }] }, context)
      .status,
    "matched",
  );

  // Unknown/missing inputs are "unverified", never silently treated as a match.
  const unverified = evaluateConditions({ all: [{ field: "kitchenDirection", op: "eq", value: "south-east" }] }, {});
  assert.equal(unverified.status, "unverified");
  assert.deepEqual(unverified.missingFields, ["kitchenDirection"]);
});

test("missing inputs surface as unverified rules and report items", () => {
  const input = normalizePropertyInput({
    propertyType: "house",
    entranceDirection: "north-east",
    kitchenDirection: "north-east",
  }).value;
  const evaluation = evaluateRules(defaultRules, input, {});

  assert.ok(
    evaluation.findings.some(
      (item) => item.code === "kitchen-north-east-high",
    ),
  );
  assert.ok(evaluation.findings.every((item) => ["low", "moderate", "high"].includes(item.concern)));
  assert.ok(evaluation.findings.every((item) => !item.severity || ["low", "medium", "high"].includes(item.severity)));
  assert.ok(evaluation.unverifiedRules.length > 0);
  assert.ok(evaluation.missingFields.some((item) => item.field === "masterBedroomDirection"));

  const data = buildReportData({
    request: {
      property: input,
      media: { floorPlanUrl: "/uploads/vastu/u1/plan.jpg" },
      address: { line: "12 Test Street", city: "Pune" },
      verification: {},
    },
    rules: defaultRules,
    template: null,
  });

  assert.ok(data.missingInputs.some((item) => item.field === "masterBedroomDirection"));
  assert.equal(data.unverifiedInputs.length, 3);
  assert.ok(data.locationAssessment.limitations.length >= 2);
  assert.ok(data.zoneAnalysis.length > 0);
  assert.ok(data.directionalAssessment.length > 0);
  assert.ok(data.elementBalance.elements.length === 5);
  assert.equal(data.disclaimer, DISCLAIMER);
  assert.match(data.disclaimer, /traditional belief-based/i);
  assert.match(data.disclaimer, /not scientifically established/i);
  assert.deepEqual(
    data.template.map((section) => section.key),
    [...DEFAULT_TEMPLATE_SECTIONS].sort((a, b) => a.order - b.order).map((section) => section.key),
  );
});

test("a missing floor plan is flagged even when an address exists", () => {
  const data = buildReportData({
    request: {
      property: { propertyType: "flat", entranceDirection: "east" },
      media: {},
      address: { line: "Somewhere", city: "Delhi" },
      verification: {},
    },
    rules: defaultRules,
  });
  assert.ok(data.missingInputs.some((item) => item.field === "floorPlan"));
});

test("a fully favourable report scores high and lists strengths, not concerns", () => {
  const input = normalizePropertyInput(property).value;
  const evaluation = evaluateRules(defaultRules, input, {});
  const data = buildReportData({
    request: {
      property: input,
      media: { floorPlanUrl: "/uploads/vastu/u1/plan.jpg" },
      verification: { addressVerified: true, directionsVerified: true, mediaVerified: true },
    },
    rules: defaultRules,
  });

  assert.equal(evaluation.unverifiedRules.length > 0, true);
  assert.ok(data.strengths.length > 0);
  assert.equal(data.unverifiedInputs.length, 0);
  assert.ok(data.score >= 60, `score ${data.score}`);
  assert.equal(typeof data.verdict, "string");
  assert.ok(data.findings.every((finding) => finding.kind === "concern"));
  assert.ok(data.findings.every((finding) => finding.explanation));
  assert.ok(data.recommendations.every((item) => typeof item === "string" && item.length));
});

test("scoring and verdicts are bounded and ordered by concern", () => {
  const findings = [
    { concern: "high" },
    { concern: "high" },
    { concern: "moderate" },
    { concern: "low" },
  ];
  const score = computeScore(findings);
  assert.ok(score >= 0 && score <= 100);
  assert.ok(computeScore([{ concern: "low" }]) > computeScore(findings));
  assert.equal(computeScore([]), 100);
  assert.match(verdictFor(95), /excellent|favourable|good/i);
  assert.match(verdictFor(5), /significant|concern/i);
});

test("element balance maps the five elements to traditional directions", () => {
  const balance = buildElementBalance(property);
  assert.deepEqual(
    balance.elements.map((element) => element.element).sort(),
    ["air", "earth", "fire", "space", "water"],
  );
  assert.ok(balance.mapping.north);
  assert.equal(balance.elements.find((element) => element.element === "fire").status !== "missing", true);
  assert.ok(balance.note.includes("traditions"));
  for (const direction of DIRECTIONS) assert.ok(direction in balance.mapping);
});

test("request status flow includes review, analysis, more-info and completion", () => {
  assert.equal(canTransition("submitted", "pending_review"), true);
  assert.equal(canTransition("pending_review", "under_review"), true);
  assert.equal(canTransition("under_review", "analysis_in_progress"), true);
  assert.equal(canTransition("analysis_in_progress", "report_ready"), true);
  assert.equal(canTransition("report_ready", "completed"), true);
  assert.equal(canTransition("pending_review", "more_information_required"), true);
  assert.equal(canTransition("more_information_required", "under_review"), true);
  assert.equal(canTransition("completed", "report_ready"), true);
  assert.equal(canTransition("completed", "analysis_in_progress"), false);
  assert.equal(canTransition("cancelled", "pending_review"), false);
  assert.equal(canTransition("pending_review", "report_ready"), false);
});

test("address extraction accepts manual text, maps links and pins", () => {
  const fromLine = extractAddress({ addressLine: "12 MG Road", city: "Pune", pincode: "411001" });
  assert.equal(fromLine.line, "12 MG Road");
  assert.equal(fromLine.city, "Pune");
  assert.equal(fromLine.source, "manual");

  const fromUrl = extractAddress({
    addressLine: "12 MG Road",
    mapsUrl: "https://www.google.com/maps/@18.5204,73.8567,15z",
  });
  assert.equal(fromUrl.source, "google_maps_link");
  assert.equal(fromUrl.latitude, 18.5204);
  assert.equal(fromUrl.longitude, 73.8567);

  const fromPin = extractAddress({ latitude: 19.076, longitude: 72.8777 });
  assert.equal(fromPin.source, "map_pin");
  assert.equal(fromPin.latitude, 19.076);

  assert.throws(() => extractAddress({ mapsUrl: "not a url" }), /must start with/);
  assert.throws(() => extractAddress({}), /Please provide an address/);
  assert.throws(() => extractAddress({ latitude: 100, longitude: 20 }), /Latitude/);
});

test("property and birth payloads may arrive nested or flattened", () => {
  const nested = extractPropertyInput({
    property: JSON.stringify({ propertyType: "flat", kitchenDirection: "SE" }),
    houseFacing: "east",
  });
  assert.equal(nested.propertyType, "flat");
  assert.equal(nested.kitchenDirection, "SE");
  assert.equal(nested.houseFacing, "east");

  const birth = extractBirthDetails({
    birthDetails: { dateOfBirth: "1990-01-01", timeOfBirth: "10:30" },
    placeOfBirth: "Mumbai",
  });
  assert.equal(birth.placeOfBirth, "Mumbai");
  assert.ok(birth.dateOfBirth instanceof Date);
});

test("report PDF has a valid header, content and EOF marker", () => {
  const input = normalizePropertyInput(property).value;
  const data = buildReportData({
    request: {
      _id: "req-1",
      property: input,
      media: { floorPlanUrl: "/uploads/vastu/u1/plan.jpg" },
      address: { line: "12 Test Street", city: "Pune", state: "Maharashtra" },
      verification: { addressVerified: true, directionsVerified: true, mediaVerified: true },
    },
    rules: defaultRules,
    reviewer: { _id: "reviewer-1" },
  });
  const report = { ...data, _id: "report-1", request: "req-1", status: "published", version: 1 };
  const pdf = buildVastuReportPdf({
    report,
    request: { _id: "req-1", property: input, address: { line: "12 Test Street", city: "Pune" } },
  });

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.match(pdf.toString("latin1"), /\/Type \/Pages/);
  assert.match(pdf.toString("latin1"), /%%EOF/);
  assert.ok(pdf.length > 1000);
});

test("field registry drives validation and only known fields are accepted", () => {
  assert.ok(FIELD_REGISTRY.propertyType);
  assert.ok(FIELD_REGISTRY.entranceDirection);
  const normalized = normalizePropertyInput({ madeUpField: "value", houseFacing: "west" });
  assert.equal(normalized.value.madeUpField, undefined);
  assert.equal(normalized.value.houseFacing, "west");
});
