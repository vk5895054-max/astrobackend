const {
  RASHIS,
  RASHI_LORDS,
  NAKSHATRAS,
  getNakshatra,
} = require("./vedicAstrologyService");

const DASHA_YEARS = {
  Ketu: 7,
  Venus: 20,
  Sun: 6,
  Moon: 10,
  Mars: 7,
  Rahu: 18,
  Jupiter: 16,
  Saturn: 19,
  Mercury: 17,
};

const TOTAL_DASHA_YEARS = Object.values(DASHA_YEARS).reduce((a, b) => a + b, 0); // 120

const DASHA_ORDER = [
  "Ketu",
  "Venus",
  "Sun",
  "Moon",
  "Mars",
  "Rahu",
  "Jupiter",
  "Saturn",
  "Mercury",
];

const DAYS_PER_DASHA_YEAR = 365.25;

const NAKSHATRA_LORDS = [
  "Ketu",
  "Venus",
  "Sun",
  "Moon",
  "Mars",
  "Rahu",
  "Jupiter",
  "Saturn",
  "Mercury", // 0-8
  "Ketu",
  "Venus",
  "Sun",
  "Moon",
  "Mars",
  "Rahu",
  "Jupiter",
  "Saturn",
  "Mercury", // 9-17
  "Ketu",
  "Venus",
  "Sun",
  "Moon",
  "Mars",
  "Rahu",
  "Jupiter",
  "Saturn",
  "Mercury", // 18-26
];

const nakshatraLord = (nakshatraIndex) =>
  NAKSHATRA_LORDS[nakshatraIndex] ?? "Ketu";

const dashaIndex = (planet) => DASHA_ORDER.indexOf(planet);

const yearsToDays = (years) => years * DAYS_PER_DASHA_YEAR;

const addDays = (date, days) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const round = (value, places = 4) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const calculateDashaBalance = (moonSiderealLongitude) => {
  if (!Number.isFinite(moonSiderealLongitude)) {
    throw new TypeError(
      "calculateDashaBalance requires a finite Moon sidereal longitude",
    );
  }

  const { name, index, pada } = getNakshatra(moonSiderealLongitude);
  const span = 360 / 27; // 13°20'
  const lon = ((moonSiderealLongitude % 360) + 360) % 360;
  const within = lon - index * span;
  const proportionTraversed = within / span;
  const proportionRemaining = 1 - proportionTraversed;

  const lord = nakshatraLord(index);
  const balanceYears = DASHA_YEARS[lord] * proportionRemaining;

  return {
    lord,
    nakshatra: name,
    pada,
    proportionTraversed: round(proportionTraversed),
    proportionRemaining: round(proportionRemaining),
    balanceYears: round(balanceYears),
    balanceDays: round(yearsToDays(balanceYears), 2),
  };
};

const buildSubPeriods = (startDate, totalDays, startPlanet) => {
  const offset = dashaIndex(startPlanet);
  let cursor = startDate;

  return DASHA_ORDER.map((_, i) => {
    const planet =
      DASHA_ORDER[
        (((offset + i) % DASHA_ORDER.length) + DASHA_ORDER.length) %
          DASHA_ORDER.length
      ];
    const share = (DASHA_YEARS[planet] / TOTAL_DASHA_YEARS) * totalDays;
    const period = {
      planet,
      start: cursor,
      end: addDays(cursor, share),
      days: round(share, 2),
      years: round(share / DAYS_PER_DASHA_YEAR, 2),
    };
    cursor = addDays(cursor, share);
    return period;
  });
};

const buildMahadashas = ({ moonSiderealLongitude, birthDate, count = 12 }) => {
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(birth.getTime())) {
    throw new TypeError("buildMahadashas requires a valid birthDate");
  }

  const balance = calculateDashaBalance(moonSiderealLongitude);
  const startOffset = dashaIndex(balance.lord);

  const mahadashas = [];
  let cursor = birth;

  for (let i = 0; i < count; i++) {
    const planet =
      DASHA_ORDER[
        (((startOffset + i) % DASHA_ORDER.length) + DASHA_ORDER.length) %
          DASHA_ORDER.length
      ];
    const isFirst = i === 0;
    const years = isFirst ? balance.balanceYears : DASHA_YEARS[planet];
    const days = isFirst
      ? yearsToDays(balance.balanceYears)
      : yearsToDays(DASHA_YEARS[planet]);

    const period = {
      planet,
      start: cursor,
      end: addDays(cursor, days),
      days: round(days, 2),
      years: round(years, 2),
      isPartialAtBirth: isFirst,
    };
    mahadashas.push(period);
    cursor = addDays(cursor, days);
  }

  return { balance, mahadashas };
};

const isBetween = (date, period) => date >= period.start && date < period.end;

const findContaining = (periods, atDate) =>
  periods.find((p) => isBetween(atDate, p)) || null;

const getDashaTimeline = ({
  moonSiderealLongitude,
  birthDate,
  atDate = new Date(),
  mahadashaCount = 12,
}) => {
  const at = atDate instanceof Date ? atDate : new Date(atDate);
  if (Number.isNaN(at.getTime()))
    throw new TypeError("getDashaTimeline requires a valid atDate");

  const { balance, mahadashas } = buildMahadashas({
    moonSiderealLongitude,
    birthDate,
    count: mahadashaCount,
  });

  const currentMahadasha = findContaining(mahadashas, at);
  if (!currentMahadasha) {
    return { asOf: at, balance, mahadashas, current: null };
  }

  const antardashas = buildSubPeriods(
    currentMahadasha.start,
    currentMahadasha.days,
    currentMahadasha.planet,
  );
  const currentAntardasha = findContaining(antardashas, at);
  const pratyantardashas = currentAntardasha
    ? buildSubPeriods(
        currentAntardasha.start,
        currentAntardasha.days,
        currentAntardasha.planet,
      )
    : [];

  const describe = (period) =>
    period
      ? {
          planet: period.planet,
          start: period.start,
          end: period.end,
          days: period.days,
          years: period.years,
          ...(period.isPartialAtBirth ? { isPartialAtBirth: true } : {}),
        }
      : null;

  return {
    asOf: at,
    balance,
    mahadashas,
    current: {
      mahadasha: describe(currentMahadasha),
      antardasha: describe(currentAntardasha),
      pratyantardasha: describe(findContaining(pratyantardashas, at)),
      // "Dasha Sandhi" — the transition window between consecutive periods.
      // The course treats this as a notably vulnerable time (§7.1), so we
      // surface it explicitly rather than making callers diff dates.
      isDashaSandhi: !!(
        currentAntardasha &&
        addDays(
          currentAntardasha.end,
          -90 * (currentAntardasha.days / 365.25),
        ) <= at
      ),
    },
    antardashas,
    pratyantardashas,
  };
};

const getTribhagiTimeline = ({
  moonSiderealLongitude,
  birthDate,
  atDate = new Date(),
  mahadashaCount = 12,
}) => {
  const at = atDate instanceof Date ? atDate : new Date(atDate);
  if (Number.isNaN(at.getTime()))
    throw new TypeError("getTribhagiTimeline requires a valid atDate");

  const { balance, mahadashas } = buildMahadashas({
    moonSiderealLongitude,
    birthDate,
    count: mahadashaCount,
  });

  const bhagiNakshatras = (planet) =>
    NAKSHATRAS.map((name, index) => ({ name, index })).filter(
      (nak) => nakshatraLord(nak.index) === planet,
    );

  const withBhagis = mahadashas.map((mahadasha) => {
    const nakshatras = bhagiNakshatras(mahadasha.planet);
    const bhagiDays = mahadasha.days / 3;
    const bhagis = nakshatras.map((nak, i) => ({
      nakshatra: nak.name,
      nakshatraIndex: nak.index,
      lord: mahadasha.planet,
      start: addDays(mahadasha.start, bhagiDays * i),
      end: addDays(mahadasha.start, bhagiDays * (i + 1)),
      days: round(bhagiDays, 2),
      years: round(bhagiDays / DAYS_PER_DASHA_YEAR, 4),
      isPartialAtBirth: Boolean(mahadasha.isPartialAtBirth && i === 0),
    }));
    return {
      planet: mahadasha.planet,
      start: mahadasha.start,
      end: mahadasha.end,
      days: mahadasha.days,
      years: mahadasha.years,
      isPartialAtBirth: Boolean(mahadasha.isPartialAtBirth),
      bhagis,
    };
  });

  const currentMahadasha = findContaining(withBhagis, at);
  if (!currentMahadasha) {
    return {
      asOf: at,
      method:
        "Tri Bhagi Dasha — each Vimshottari mahadasha split into three equal bhagis, one per nakshatra ruled by the mahadasha lord.",
      balance,
      mahadashas: withBhagis,
      current: null,
    };
  }

  const currentBhagi = findContaining(currentMahadasha.bhagis, at);
  const antardashas = buildSubPeriods(
    currentMahadasha.start,
    currentMahadasha.days,
    currentMahadasha.planet,
  );
  const currentAntardasha = findContaining(antardashas, at);

  return {
    asOf: at,
    method:
      "Tri Bhagi Dasha — each Vimshottari mahadasha split into three equal bhagis, one per nakshatra ruled by the mahadasha lord.",
    balance,
    mahadashas: withBhagis,
    current: {
      mahadasha: {
        planet: currentMahadasha.planet,
        start: currentMahadasha.start,
        end: currentMahadasha.end,
        years: currentMahadasha.years,
        isPartialAtBirth: currentMahadasha.isPartialAtBirth,
      },
      bhagi: currentBhagi
        ? {
            nakshatra: currentBhagi.nakshatra,
            nakshatraIndex: currentBhagi.nakshatraIndex,
            lord: currentBhagi.lord,
            start: currentBhagi.start,
            end: currentBhagi.end,
            years: currentBhagi.years,
            isPartialAtBirth: currentBhagi.isPartialAtBirth,
          }
        : null,
      antardasha: currentAntardasha
        ? {
            planet: currentAntardasha.planet,
            start: currentAntardasha.start,
            end: currentAntardasha.end,
            years: currentAntardasha.years,
          }
        : null,
    },
  };
};

const getDashaHouseActivations = ({ planets = {}, timeline }) => {
  const current = timeline?.current;
  if (!current?.mahadasha) return [];

  const running = [
    { planet: current.mahadasha.planet, via: "mahadasha" },
    ...(current.antardasha
      ? [{ planet: current.antardasha.planet, via: "antardasha" }]
      : []),
    ...(current.pratyantardasha
      ? [{ planet: current.pratyantardasha.planet, via: "pratyantardasha" }]
      : []),
  ];

  return running.map(({ planet, via }) => {
    const rashi = planets?.[planet]?.rashi ?? null;
    // planets[].rashi is a sign NAME (from getRashi), not a longitude, so index
    // it against RASHIS directly — signIndexOf() would expect degrees.
    const signIdx = rashi ? RASHIS.indexOf(rashi) : -1;
    const hasPlacement = signIdx >= 0;
    // Whole-sign: a dasha activates its own house, the 7th (opposite), and the
    // 4th/10th (kendra trine) — the standard four-pada drishti set.
    const houses = hasPlacement
      ? [1, 4, 7, 10].map((h) => ((signIdx + h - 1) % 12) + 1)
      : [];
    return {
      planet,
      via,
      house: planets?.[planet]?.house ?? null,
      rashi,
      lord: rashi ? RASHI_LORDS[rashi] : null,
      houses,
    };
  });
};

module.exports = {
  DASHA_YEARS,
  DASHA_ORDER,
  NAKSHATRA_LORDS,
  TOTAL_DASHA_YEARS,
  DAYS_PER_DASHA_YEAR,
  nakshatraLord,
  calculateDashaBalance,
  buildSubPeriods,
  buildMahadashas,
  getDashaTimeline,
  getTribhagiTimeline,
  getDashaHouseActivations,
};
