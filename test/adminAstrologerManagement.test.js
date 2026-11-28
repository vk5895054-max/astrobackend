const test = require("node:test");
const assert = require("node:assert/strict");

const AstrologerProfile = require("../models/astrologerProfile");
const adminController = require("../controllers/adminController");
const adminRoutes = require("../routes/adminRoutes");

const makeResponse = () => ({
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("admin can manage photos, specialisations, ratings, pricing and availability", async () => {
  const profile = {
    displayName: "Old name",
    save: async () => {},
  };
  const originalFindOne = AstrologerProfile.findOne;
  AstrologerProfile.findOne = async () => profile;

  try {
    const res = makeResponse();
    let nextError;
    await adminController.updateAstrologer(
      {
        params: { astrologerId: "astro-user-1" },
        body: {
          displayName: "  Pandit Sharma  ",
          photo: "https://cdn.example.com/astro.jpg",
          expertise: [" Vedic ", "", "Numerology"],
          languages: ["Hindi", "English"],
          rateChatPerMin: 25,
          rateCallPerMin: 40,
          ratingAvg: 4.8,
          ratingCount: 13763,
          totalConsultations: 900,
          isOnline: true,
          freeMinutesEnabled: false,
        },
      },
      res,
      (error) => {
        nextError = error;
      },
    );

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(profile.displayName, "Pandit Sharma");
    assert.equal(profile.photo, "https://cdn.example.com/astro.jpg");
    assert.deepEqual(profile.expertise, ["Vedic", "Numerology"]);
    assert.deepEqual(profile.languages, ["Hindi", "English"]);
    assert.equal(profile.rateChatPerMin, 25);
    assert.equal(profile.rateCallPerMin, 40);
    assert.equal(profile.ratingAvg, 4.8);
    assert.equal(profile.ratingCount, 13763);
    assert.equal(profile.totalConsultations, 900);
    assert.equal(profile.isOnline, true);
    assert.equal(profile.freeMinutesEnabled, false);
  } finally {
    AstrologerProfile.findOne = originalFindOne;
  }
});

test("admin astrologer updates reject non-numeric prices and clamp invalid minutes", async () => {
  const profile = { displayName: "Pandit", save: async () => {} };
  const originalFindOne = AstrologerProfile.findOne;
  AstrologerProfile.findOne = async () => profile;

  try {
    const res = makeResponse();
    let nextError;
    await adminController.updateAstrologer(
      {
        params: { astrologerId: "astro-user-1" },
        body: { rateChatPerMin: "free" },
      },
      res,
      (error) => {
        nextError = error;
      },
    );

    assert.ok(nextError, "bad payment data is rejected");
    assert.equal(nextError.statusCode, 422);
    assert.equal(nextError.expose, true);
    assert.match(nextError.message, /rateChatPerMin/);

    nextError = undefined;
    await adminController.updateAstrologer(
      {
        params: { astrologerId: "astro-user-1" },
        body: { freeMinutesLimitMin: -20 },
      },
      makeResponse(),
      (error) => {
        nextError = error;
      },
    );

    assert.equal(nextError, undefined);
    assert.equal(profile.freeMinutesLimitMin, 0);
  } finally {
    AstrologerProfile.findOne = originalFindOne;
  }
});

test("admin detail endpoint and route are registered", async () => {
  const originalFindOne = AstrologerProfile.findOne;
  AstrologerProfile.findOne = () => ({
    populate() {
      return this;
    },
    lean: async () => ({ displayName: "Pandit Sharma" }),
  });

  try {
    const res = makeResponse();
    await adminController.getAstrologerDetail(
      { params: { astrologerId: "astro-user-1" } },
      res,
      () => {},
    );
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.displayName, "Pandit Sharma");

    const paths = adminRoutes.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));
    assert.ok(
      paths.some(
        (route) =>
          route.path === "/astrologers/:astrologerId" &&
          route.methods.includes("get"),
      ),
    );
    assert.ok(
      paths.some(
        (route) =>
          route.path === "/astrologers/:astrologerId" &&
          route.methods.includes("patch"),
      ),
    );
  } finally {
    AstrologerProfile.findOne = originalFindOne;
  }
});
