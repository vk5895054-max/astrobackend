const test = require("node:test");
const assert = require("node:assert/strict");
const {
  localizeHumanDesignChart,
  translateHumanDesignText,
} = require("../services/humanDesignLocalizationService");
const {
  CHANNELS_META,
  CENTERS_META,
  GATES_META,
  calculateHumanDesignChart,
} = require("../services/humanDesignService");
const {
  TYPES,
  GATES,
  LOVE,
} = require("../services/humanDesignHindiCatalog");
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
    "सूर्य 23.3 / पृथ्वी 43.4 (व्यक्तित्व) और सूर्य 2.4 (रचना)",
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

const getChartDisplayText = (chart) => ({
  chart: [
    chart.typeLabel,
    chart.profileLabel,
    chart.authority,
    chart.strategy,
    chart.signature,
    chart.notSelfTheme,
    chart.definition,
  ],
  environment: chart.environment && [
    chart.environment.name,
    chart.environment.polarity,
    chart.environment.label,
    chart.environment.description,
  ],
  incarnationCross: chart.incarnationCross && [
    chart.incarnationCross.angle,
    chart.incarnationCross.name,
    chart.incarnationCross.summary,
  ],
  centers: chart.centers?.map((center) => [
    center.displayName,
    center.statusLabel,
    center.keywords,
    center.keywordsText,
    center.description,
  ]),
  gates: chart.gates?.map((gate) => [
    gate.label,
    gate.name,
    gate.keynote,
    gate.description,
    gate.activations?.map((activation) => [
      activation.planet,
      activation.sign,
      activation.gateName,
    ]),
  ]),
  channels: chart.channels?.map((channel) => [
    channel.title,
    channel.name,
    channel.description,
  ]),
  activations: [chart.personality, chart.design]?.map((rows) =>
    rows?.map((row) => [row.planet, row.sign, row.gateName]),
  ),
  bodyGraph: chart.bodyGraph && [
    chart.bodyGraph.centers?.map((center) => [
      center.displayName,
      center.statusLabel,
      center.keywords,
      center.description,
    ]),
    chart.bodyGraph.channels?.map((channel) => [
      channel.title,
      channel.name,
      channel.description,
    ]),
    chart.bodyGraph.activeGates?.map((gate) => [gate.name]),
    [chart.bodyGraph.design, chart.bodyGraph.personality]?.map((rows) =>
      rows?.map((row) => [row.planet, row.sign, row.gateName]),
    ),
  ],
  definedCenters: chart.definedCenters,
  love: chart.love && [
    chart.love.badge,
    chart.love.title,
    chart.love.type,
    chart.love.headline,
    chart.love.summary,
    chart.love.strengths,
    chart.love.challenges,
    chart.love.compatibleDynamics,
    chart.love.activeLoveChannels?.map((channel) => [channel.title, channel.name]),
    chart.love.activeLoveGates?.map((gate) => [gate.label, gate.name]),
  ],
  about: chart.about && [
    chart.about.yourType && [
      chart.about.yourType.label,
      chart.about.yourType.subtitle,
      chart.about.yourType.description,
      chart.about.yourType.strategy,
      chart.about.yourType.signature,
      chart.about.yourType.notSelfTheme,
    ],
    chart.about.profile && [
      chart.about.profile.name,
      chart.about.profile.label,
      chart.about.profile.description,
    ],
    chart.about.authorityAndStrategy && [
      chart.about.authorityAndStrategy.authority,
      chart.about.authorityAndStrategy.strategy,
      chart.about.authorityAndStrategy.label,
      chart.about.authorityAndStrategy.description,
    ],
    chart.about.notSelfTheme && [
      chart.about.notSelfTheme.label,
      chart.about.notSelfTheme.description,
    ],
    chart.about.definition && [
      chart.about.definition.label,
      chart.about.definition.description,
    ],
    chart.about.signature && [
      chart.about.signature.label,
      chart.about.signature.description,
    ],
    chart.about.environment && [
      chart.about.environment.name,
      chart.about.environment.polarity,
      chart.about.environment.label,
      chart.about.environment.description,
    ],
    chart.about.incarnationCross && [
      chart.about.incarnationCross.angle,
      chart.about.incarnationCross.name,
      chart.about.incarnationCross.summary,
    ],
  ],
});

const assertNoLatinDisplayText = (value) => {
  if (typeof value === "string") {
    assert.doesNotMatch(value, /[A-Za-z]/, `Expected Hindi display text, got "${value}"`);
  } else if (Array.isArray(value)) {
    value.forEach(assertNoLatinDisplayText);
  } else if (value && typeof value === "object") {
    Object.values(value).forEach(assertNoLatinDisplayText);
  }
};

test("localizes display text throughout a generated Hindi chart", () => {
  const chart = calculateHumanDesignChart({
    name: "Riya Mehta",
    dateOfBirth: "1992-06-15",
    timeOfBirth: "10:30",
    place: "Jaipur",
  });
  const localized = localizeHumanDesignChart(chart, "hi-IN");

  assert.equal(localized.name, "Riya Mehta");
  assert.equal(localized.type, chart.type);
  assert.equal(localized.birthDetails.place, "Jaipur");
  assertNoLatinDisplayText(getChartDisplayText(localized));
});

test("localizes every gate and channel catalog entry and all five love types", () => {
  const allGates = Object.keys(GATES_META).map((number) => ({
    number: Number(number),
    name: GATES_META[number].name,
    label: `Gate ${number}`,
    keynote: GATES_META[number].keynote,
    description: GATES_META[number].description,
  }));
  const allChannels = CHANNELS_META.map((channel) => ({
    id: channel.id,
    title: `Channel ${channel.id}`,
    name: channel.name,
    description: channel.description,
  }));
  const baseChart = {
    type: "generator",
    typeLabel: "Generator",
    profile: "1/3",
    authority: "Sacral",
    definition: "Single Definition",
    centers: CENTERS_META.map((center) => ({
      name: center.name,
      defined: true,
      displayName: center.displayName,
      keywords: center.keywords,
      description: center.definedDescription,
    })),
    gates: allGates,
    channels: allChannels,
    environment: {
      color: 4,
      name: "Mountains",
      polarity: "Active",
      label: "Mountains (Active)",
      description: "English environment description",
    },
    about: {
      yourType: {},
      profile: {},
      authorityAndStrategy: { authority: "Sacral" },
      notSelfTheme: {},
      definition: {},
      signature: {},
    },
  };
  const localized = localizeHumanDesignChart(baseChart, "hi-IN");

  assert.equal(localized.gates.length, Object.keys(GATES).length);
  assert.equal(localized.channels.length, CHANNELS_META.length);
  assertNoLatinDisplayText(getChartDisplayText(localized));

  for (const type of Object.keys(LOVE)) {
    const loveChart = localizeHumanDesignChart({
      type,
      typeLabel: "English type",
      love: {
        badge: "LOVE",
        title: "Love for Type",
        type: TYPES[type].label,
        headline: "English headline",
      },
    }, "hi-IN");
    assertNoLatinDisplayText(getChartDisplayText(loveChart));
  }

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
