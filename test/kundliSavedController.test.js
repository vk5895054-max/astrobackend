const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSavedKundli,
  listSavedKundlis,
  listSavedMatches,
  saveKundliMatch,
} = require("../controllers/kundliSavedController");
const Horoscope = require("../models/horoscope");
const SavedKundli = require("../models/savedKundli");
const SavedKundliMatch = require("../models/savedKundliMatch");

const response = () => {
  let statusCode = 200;
  let payload;
  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      payload = data;
      return res;
    },
  };
  return {
    res,
    result: () => ({ statusCode, payload }),
  };
};

test("saving a Kundli rejects incomplete birth details", async () => {
  const { res, result } = response();
  await createSavedKundli(
    {
      user: { _id: "user-1" },
      body: { dateOfBirth: "not-a-date" },
    },
    res,
    (error) => {
      throw error;
    },
  );
  assert.equal(result().statusCode, 400);
  assert.match(result().payload.message, /birth details/i);
});

test("saving a Kundli Milan rejects an incomplete report", async () => {
  const { res, result } = response();
  await saveKundliMatch(
    {
      user: { _id: "user-1" },
      body: { report: { boy: {}, girl: {} } },
    },
    res,
    (error) => {
      throw error;
    },
  );
  assert.equal(result().statusCode, 400);
  assert.match(result().payload.message, /complete Kundli Milan report/i);
});

test("saved Kundli creation returns an account-owned list item", async () => {
  const originalCreate = SavedKundli.create;
  const savedAt = new Date("2026-11-02T00:00:00.000Z");
  SavedKundli.create = async (item) => ({
    ...item,
    _id: "saved-1",
    createdAt: savedAt,
  });
  try {
    const { res, result } = response();
    await createSavedKundli(
      {
        user: { _id: "user-1", name: "Account User" },
        body: {
          name: "Aisha",
          dateOfBirth: "1995-04-12",
          timeOfBirth: "15:56:00",
          place: "Agra",
          gender: "Female",
          latitude: 27.1767,
          longitude: 78.0081,
          timeZoneOffsetMinutes: 330,
        },
      },
      res,
      (error) => {
        throw error;
      },
    );
    assert.equal(result().statusCode, 201);
    assert.equal(result().payload.data.item.id, "saved-1");
    assert.equal(result().payload.data.item.name, "Aisha");
    assert.equal(result().payload.data.item.place, "Agra");
  } finally {
    SavedKundli.create = originalCreate;
  }
});

test("saved lists are filtered to the signed-in account", async () => {
  const originalSavedFind = SavedKundli.find;
  const originalProfileFindOne = Horoscope.findOne;
  const originalMatchFind = SavedKundliMatch.find;
  SavedKundli.find = (filter) => {
    assert.deepEqual(filter, { user: "user-1" });
    return {
      sort: () => ({
        lean: async () => [
          {
            _id: "saved-1",
            name: "Aisha",
            dateOfBirth: new Date("1995-04-12T00:00:00.000Z"),
            timeOfBirth: "15:56",
            place: "Agra",
            createdAt: new Date("2026-11-01T00:00:00.000Z"),
          },
        ],
      }),
    };
  };
  Horoscope.findOne = (filter) => {
    assert.deepEqual(filter, { user: "user-1" });
    return { lean: async () => null };
  };
  SavedKundliMatch.find = (filter) => {
    assert.deepEqual(filter, { user: "user-1" });
    return {
      sort: () => ({
        lean: async () => [{ report: { boy: { name: "Rahul" } } }],
      }),
    };
  };
  try {
    const savedResponse = response();
    await listSavedKundlis(
      { user: { _id: "user-1" } },
      savedResponse.res,
      (error) => {
        throw error;
      },
    );
    assert.equal(
      savedResponse.result().payload.data.items[0].name,
      "Aisha",
    );

    const matchResponse = response();
    await listSavedMatches(
      { user: { _id: "user-1" } },
      matchResponse.res,
      (error) => {
        throw error;
      },
    );
    assert.deepEqual(
      matchResponse.result().payload.data.matches,
      [{ boy: { name: "Rahul" } }],
    );
  } finally {
    SavedKundli.find = originalSavedFind;
    Horoscope.findOne = originalProfileFindOne;
    SavedKundliMatch.find = originalMatchFind;
  }
});
