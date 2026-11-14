const test = require("node:test");
const assert = require("node:assert/strict");
const {
  localizeHumanDesignChart,
  translateHumanDesignText,
} = require("../services/humanDesignLocalizationService");
const {
  localizeApiResponse,
} = require("../services/apiLocalizationService");
const apiLanguageMiddleware = require("../middlewares/apiLanguageMiddleware");

test("localizes chart copy for Hindi without changing identifiers or source data", () => {
  const chart = {
    name: "Riya Mehta",
    type: "manifestingGenerator",
    typeLabel: "Manifesting Generator",
    profileLabel: "5/1 Heretic Investigator",
    centers: [
      {
        name: "Throat",
        displayName: "Throat Center",
        statusLabel: "DEFINED",
        keywords: ["communication", "expression"],
      },
    ],
    gates: [
      {
        number: 23,
        label: "Gate 23",
        name: "The Gate of Assimilation",
        center: "Throat",
      },
    ],
    channels: [
      {
        id: "23-43",
        title: "Channel 23-43",
        centers: ["Throat", "Ajna"],
      },
    ],
    environment: {
      name: "Mountains",
      polarity: "Passive",
      label: "Mountains (Passive)",
    },
    incarnationCross: {
      angle: "Left Angle",
      summary: "Sun 23.3 / Earth 43.4 (Personality) & Sun 2.4 (Design)",
    },
    about: {
      yourType: {
        description:
          "Multi-passionate builder combining endless Sacral endurance with fast motor-to-Throat manifestation speed.",
      },
    },
  };

  const localized = localizeHumanDesignChart(chart, "hi-IN");

  assert.notEqual(localized, chart);
  assert.equal(localized.name, "Riya Mehta");
  assert.equal(localized.type, "manifestingGenerator");
  assert.equal(localized.centers[0].name, "Throat");
  assert.equal(localized.centers[0].displayName, "कंठ केंद्र");
  assert.equal(localized.centers[0].keywords[0], "संचार");
  assert.equal(localized.gates[0].label, "द्वार 23");
  assert.equal(localized.gates[0].name, "आत्मसात का द्वार");
  assert.equal(localized.gates[0].center, "Throat");
  assert.equal(localized.channels[0].title, "मार्ग 23-43");
  assert.deepEqual(localized.channels[0].centers, ["Throat", "Ajna"]);
  assert.equal(localized.environment.label, "पहाड़ (निष्क्रिय)");
  assert.equal(
    localized.incarnationCross.summary,
    "सूर्य 23.3 / पृथ्वी 43.4 (व्यक्तित्व) & सूर्य 2.4 (रचना)",
  );
  assert.match(localized.about.yourType.description, /आपकी अनेक रुचियाँ/);
  assert.equal(chart.centers[0].displayName, "Throat Center");
});

test("leaves non-Hindi responses unchanged", () => {
  const chart = { typeLabel: "Generator" };

  assert.equal(localizeHumanDesignChart(chart, "en-US"), chart);
  assert.equal(localizeHumanDesignChart(chart, ""), chart);
  assert.equal(translateHumanDesignText("Generator"), "निर्माता");
});

test("localizes API messages and embedded chart data by request language", () => {
  const response = {
    success: true,
    message: "Horoscope retrieved",
    data: {
      myChart: {
        typeLabel: "Generator",
        profileLabel: "1/3 Investigator Martyr",
      },
    },
  };

  assert.deepEqual(localizeApiResponse(response, "hi-IN"), {
    success: true,
    message: "कुंडली प्राप्त हुई",
    data: {
      myChart: {
        typeLabel: "निर्माता",
        profileLabel: "1/3 अन्वेषक प्रयोगशील साधक",
      },
    },
  });
  assert.equal(localizeApiResponse(response, "en-US"), response);
});

test("language middleware uses Accept-Language for every JSON response", () => {
  let localizedResponse;
  let nextCalled = false;
  let varyHeader;
  const req = { get: () => "hi-IN, en;q=0.8" };
  const res = {
    vary(header) {
      varyHeader = header;
    },
    json(body) {
      localizedResponse = body;
      return this;
    },
  };

  apiLanguageMiddleware(req, res, () => {
    nextCalled = true;
  });
  res.json({ success: false, message: "Authentication required" });

  assert.equal(nextCalled, true);
  assert.equal(req.language, "hi-IN");
  assert.equal(varyHeader, "Accept-Language");
  assert.equal(localizedResponse.message, "लॉग इन करना ज़रूरी है");
});
