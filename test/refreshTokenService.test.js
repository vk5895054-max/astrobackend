const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/user");
const refreshService = require("../services/refreshTokenService");
const authController = require("../controllers/authController");

const makeResponse = () => {
  const cookies = [];
  return {
    cookies,
    cookie(name, value) {
      cookies.push({ name, value });
    },
    clearCookie(name) {
      cookies.push({ name, value: null });
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
};

test("refresh sessions are stored hashed, capped and time-limited", async () => {
  const user = { refreshTokens: [], save: async () => {} };
  const issued = [];

  for (let i = 0; i < 7; i += 1) {
    issued.push(await refreshService.issueFor(user));
  }

  assert.equal(user.refreshTokens.length, 5, "only five devices stay signed in");
  assert.ok(
    user.refreshTokens.every((entry) => entry.hash !== entry.expiresAt),
  );
  assert.ok(
    user.refreshTokens.every(
      (entry) => entry.hash.length === 64 && entry.hash !== issued.at(-1),
    ),
    "the raw token is never stored in plain text",
  );
  assert.ok(
    user.refreshTokens.at(-1).expiresAt.getTime() > Date.now(),
  );
  assert.equal(
    refreshService.hash(issued.at(-1)),
    user.refreshTokens.at(-1).hash,
    "the returned token matches the stored hash",
  );
});

test("rotate renews one session and rejects replay of the old token", async () => {
  const user = {
    isActive: true,
    refreshTokens: [
      {
        hash: refreshService.hash("first-refresh"),
        expiresAt: new Date(Date.now() + 60000),
      },
    ],
    save: async () => {},
  };
  const originalFindOne = User.findOne;
  User.findOne = () => ({ select: async () => user });

  try {
    const rotated = await refreshService.rotate("first-refresh");
    assert.ok(rotated, "a valid refresh token is accepted");
    assert.notEqual(rotated.refreshToken, "first-refresh");
    assert.equal(
      user.refreshTokens[0].hash,
      refreshService.hash(rotated.refreshToken),
    );
    assert.equal(await refreshService.rotate("first-refresh"), null,
      "the old token cannot be used again");
  } finally {
    User.findOne = originalFindOne;
  }
});

test("rotate rejects expired and inactive sessions", async () => {
  const originalFindOne = User.findOne;
  try {
    User.findOne = () => ({
      select: async () => ({
        isActive: true,
        refreshTokens: [
          {
            hash: refreshService.hash("stale-refresh"),
            expiresAt: new Date(Date.now() - 1000),
          },
        ],
      }),
    });
    assert.equal(await refreshService.rotate("stale-refresh"), null);

    User.findOne = () => ({
      select: async () => ({
        isActive: false,
        refreshTokens: [
          {
            hash: refreshService.hash("inactive-refresh"),
            expiresAt: new Date(Date.now() + 60000),
          },
        ],
      }),
    });
    assert.equal(await refreshService.rotate("inactive-refresh"), null);
  } finally {
    User.findOne = originalFindOne;
  }
});

test("revoke removes only the requested device session", async () => {
  const user = {
    refreshTokens: [
      { hash: refreshService.hash("phone"), expiresAt: new Date() },
      { hash: refreshService.hash("tablet"), expiresAt: new Date() },
    ],
    save: async () => {},
  };
  const originalFindOne = User.findOne;
  User.findOne = () => ({ select: async () => user });

  try {
    await refreshService.revoke("phone");
    assert.equal(user.refreshTokens.length, 1);
    assert.equal(user.refreshTokens[0].hash, refreshService.hash("tablet"));
  } finally {
    User.findOne = originalFindOne;
  }
});

test("login issues a refresh token alongside the access token", async () => {
  process.env.JWT_SECRET = "test-jwt-secret";
  const password = await bcrypt.hash("password123", 4);
  const user = {
    _id: "507f191e810c19729de860ea",
    name: "Aarav",
    email: "aarav@example.com",
    password,
    gender: "male",
    role: "user",
    isActive: true,
    refreshTokens: [],
    save: async () => {},
    toSafeObject() {
      return { id: this._id, name: this.name, email: this.email };
    },
  };
  const originalFindOne = User.findOne;
  User.findOne = () => ({ select: async () => user });
  const res = makeResponse();

  try {
    await authController.login(
      { body: { email: "AARAV@example.com", password: "password123" } },
      res,
    );
  } finally {
    User.findOne = originalFindOne;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.refreshToken, "the client receives a renewable token");
  assert.equal(jwt.verify(res.body.token, "test-jwt-secret").userId, user._id);
  assert.deepEqual(
    res.cookies.map((cookie) => cookie.name),
    ["token", "refreshToken"],
  );
});

test("refresh returns rotated credentials and sets both cookies", async () => {
  process.env.JWT_SECRET = "test-jwt-secret";
  const originalRotate = refreshService.rotate;
  refreshService.rotate = async () => ({
    user: {
      _id: "507f191e810c19729de860ea",
      toSafeObject: () => ({ id: "507f191e810c19729de860ea" }),
    },
    refreshToken: "rotated-refresh",
  });
  const res = makeResponse();

  try {
    await authController.refresh(
      { body: { refreshToken: "valid-refresh" }, cookies: {} },
      res,
    );
  } finally {
    refreshService.rotate = originalRotate;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.token.length > 0, true);
  assert.equal(res.body.refreshToken, "rotated-refresh");
  assert.deepEqual(
    res.cookies.map((cookie) => cookie.name),
    ["token", "refreshToken"],
  );
});

test("refresh rejects a token that is no longer valid", async () => {
  const originalRotate = refreshService.rotate;
  refreshService.rotate = async () => null;
  const res = makeResponse();

  try {
    await authController.refresh(
      { body: { refreshToken: "replayed" }, cookies: {} },
      res,
    );
  } finally {
    refreshService.rotate = originalRotate;
  }

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.cookies.length, 0, "no session is issued to a replayed token");
});
