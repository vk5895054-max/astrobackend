// Lal Kitab service — planet-in-house predictions and the classic Lal Kitab
// remedial measures for the Kundli AI report (categories.lal_kitab).
//
// Lal Kitab (the "Red Book") reads a planet from the HOUSE it occupies and
// prescribes practical, household remedies — charity, service and simple
// observances — rather than gemstones alone. This module is a deterministic
// lookup: no ephemeris, no network. The caller supplies the already-computed
// chart planets so this module never imports the chart service back
// (CommonJS cycles).

// --- House-wise life area and the standard house charity -----------------
const HOUSE_INFO = {
  1: { area: "Self, body, temperament", remedy: "Offer water to the Sun every morning and respect your elders." },
  2: { area: "Wealth, family, speech", remedy: "Donate milk, rice and food on Mondays and feed green fodder to cows." },
  3: { area: "Courage, siblings, effort", remedy: "Feed birds daily and speak truthfully — never deceive in speech." },
  4: { area: "Home, mother, comfort, property", remedy: "Donate white items on Mondays and care for your mother." },
  5: { area: "Children, intelligence, speculation", remedy: "Offer sweets to children and donate turmeric on Thursdays." },
  6: { area: "Enemies, debts, disease, service", remedy: "Feed street dogs daily and abstain from alcohol." },
  7: { area: "Marriage, partnership, public dealing", remedy: "Donate sugar or sweets on Fridays and treat your spouse with kindness." },
  8: { area: "Longevity, obstacles, inheritance", remedy: "Feed crows regularly and donate black items on Saturdays." },
  9: { area: "Fortune, father, dharma, higher learning", remedy: "Donate books and offer water to a peepal tree on Thursdays." },
  10: { area: "Career, status, karma", remedy: "Feed the poor and respect your superiors at work." },
  11: { area: "Gains, friends, ambitions", remedy: "Donate clothes to the needy and plant trees." },
  12: { area: "Losses, expenditure, foreign lands", remedy: "Offer water to the Sun, donate food and keep expenses honest." },
};

// --- Planet-wise Lal Kitab rules -----------------------------------------
// effect[i] = house i+1 reading; remedy/avoid = the standing Lal Kitab rule.
const PLANET_RULES = {
  Sun: {
    keyword: "authority, government and the father",
    effect: [
      "gives a strong sense of self, leadership and a commanding presence",
      "protects family wealth and gives a frank, influential speech",
      "adds courage, initiative and the drive to compete and win",
      "brings comfort through property, vehicles and a respected home",
      "favours intelligence, recognition for children and success in speculation",
      "defeats enemies and gives success in service, medicine and litigation",
      "puts authority into partnership — marriage and public dealing carry status",
      "gives sudden rise and fall, occult interest and inheritance through the father",
      "strengthens fortune, dharma and the blessing of father and teachers",
      "the Sun's best house — career, government service and public standing",
      "turns authority into steady gains, influential friends and long ambitions",
      "gives foreign connection, expenditure for the father and a private rise",
    ],
    remedy:
      "Offer water to the Sun every morning; respect your father and authority figures; carry a copper coin on Sundays.",
    avoid: "Never disrespect your father or your superiors.",
  },
  Moon: {
    keyword: "the mind, mother and emotions",
    effect: [
      "makes the mind gentle, intuitive and sensitive to others' feelings",
      "gives wealth through the mother, food and a pleasing voice",
      "adds imagination, courageous speech and a restless, curious mind",
      "the Moon's own ground — mental peace, mother's blessing, property and comfort",
      "favours learning, emotional intelligence and blessing through children",
      "an anxious mind in illness and disputes; service in healing suits you",
      "the mind seeks companionship; marriage and public mood strongly influence you",
      "a deep, intuitive mind, interest in the hidden and emotional upheavals",
      "grace through mother, fortune and faith; good for study and travel abroad",
      "the mind drives career — public dealing, hospitality, care and creativity",
      "gains through networks and the mother, with ever-changing moods",
      "expenditure for the mother, foreign settlement and a reflective mind",
    ],
    remedy:
      "Respect your mother; donate milk or white clothes on Mondays; never store bare or stale milk overnight.",
    avoid: "Never speak harshly to your mother or elders.",
  },
  Mars: {
    keyword: "energy, siblings and courage",
    effect: [
      "gives physical energy, boldness and a hot, competitive temperament",
      "wealth through land and courage in speech; watch harsh words",
      "excellent for initiative, younger siblings and fearless effort",
      "comfort through property and vehicles; temper at home needs control",
      "sharp intellect, courage in speculation and protection for children",
      "the classic warrior placement — victory over enemies, debts and disease",
      "impulsive in marriage and partnership; harmony needs patience",
      "sudden accidents or courage through crises; interest in surgery and the occult",
      "fortune through brothers, courage in dharma and a strong will",
      "karma yoga — command, engineering, defence and land-related career",
      "gains through siblings, machines and bold enterprise",
      "losses through haste; foreign land can bring anger or recovery",
    ],
    remedy:
      "Keep honey at home; donate vermilion and sweets on Tuesdays; feed a young boy or serve brothers.",
    avoid: "Never accept gifts of knives or blood-related items.",
  },
  Mercury: {
    keyword: "speech, trade and the intellect",
    effect: [
      "gives a witty, expressive personality and quick reasoning",
      "speech becomes a source of wealth; business and savings favour you",
      "excellent for writing, marketing, siblings and short travels",
      "peace at home through knowledge; comfort via vehicles and property",
      "strong intelligence, creative children and success in study and speculation",
      "wins through strategy and communication in disputes, service and trade",
      "business partnership and marriage through negotiation; a clever companion",
      "a research mind with sudden gains in trade and interest in the hidden",
      "fortune through teaching, writing and an ethical, disciplined father",
      "career in trade, accounts, media or technology with a steady rise",
      "gains through communication, friends and commercial networks",
      "expenditure on learning; foreign trade and a private communicative style",
    ],
    remedy:
      "Feed green fodder to cows; donate green items on Wednesdays; keep your speech and accounts clean.",
    avoid: "Never deceive in speech or trade.",
  },
  Jupiter: {
    keyword: "wisdom, wealth and children",
    effect: [
      "gives wisdom, a benevolent nature and a respected personality",
      "wealth, family blessing and a truthful, generous speech",
      "courage of conviction, younger siblings and success through effort",
      "comfort, property and the blessing of a virtuous mother",
      "the classic house for children, learning and fortunate speculation",
      "defeats enemies through wisdom; good for healing, law and service",
      "a wise, supportive spouse and gains through partnership",
      "long life, deep wisdom and fortune through inheritance",
      "the best house — fortune, dharma, father's blessing and teachers",
      "career honour, teaching, advisory roles and public trust",
      "steady gains, influential friends and fulfilled ambitions",
      "wise expenditure, foreign fortune and a spiritual finish",
    ],
    remedy:
      "Offer water to a peepal tree on Thursdays; donate turmeric and books; feed yellow sweets to children.",
    avoid: "Never insult your teachers or elders.",
  },
  Venus: {
    keyword: "love, luxury and art",
    effect: [
      "grace, charm, artistic taste and a refined, pleasure-loving nature",
      "wealth, fine speech and luxury through the family",
      "creative courage, siblings and success in art, media and vehicles",
      "a beautiful home, vehicles, comfort and a devoted mother",
      "romance, artistic children and gains through creative speculation",
      "wins over enemies through charm; good for fashion, design and service",
      "the karaka house — happy marriage, business partnership and public appeal",
      "a passionate nature, sudden gains through luxury and interest in the occult",
      "fortune through art, luxury and a cultured father or mentor",
      "career in art, fashion, hospitality, beauty or entertainment",
      "gains through networks, luxury and well-placed friends",
      "foreign luxury, expenditure on comforts and a private love life",
    ],
    remedy:
      "Donate sugar or white sweets on Fridays; keep your home clean and honour women and your spouse.",
    avoid: "Never betray your spouse or keep an unclean home.",
  },
  Saturn: {
    keyword: "discipline, delay and karma",
    effect: [
      "a serious, hardworking nature; success arrives through patience",
      "steady wealth through discipline, frugality and long effort",
      "courage through endurance; gains from younger siblings and service",
      "delay in comfort, but deep stability in property and later-life peace",
      "steady, late gains through children, planning and hard study",
      "the strongest upachaya — Saturn defeats enemies, debts and disease",
      "delay in marriage but a mature, enduring partner",
      "longevity, interest in the occult and gains through others' resources",
      "fortune through hard work, discipline and a strict but fair father",
      "the best house for Saturn — a career built slowly and lastingly",
      "gains arrive steadily and ambitions fulfil with patience",
      "expenditure through isolation; foreign lands and moksha leanings",
    ],
    remedy:
      "Feed black sesame to crows or donate black items on Saturdays; serve the elderly and labourers.",
    avoid: "Never exploit workers or refuse help to the needy.",
  },
  Rahu: {
    keyword: "amplification, foreign connection and sudden events",
    effect: [
      "intense ambitions, an unconventional personality and sudden impulses",
      "sudden wealth, foreign connection and unusual speech",
      "fearless, unconventional effort; gains through technology and siblings",
      "an unconventional home life, property abroad and restlessness at the root",
      "sharp, unconventional intelligence and gains through sudden speculation",
      "defeats enemies in unusual ways; good for medicine, tech and litigation",
      "an unconventional or inter-community marriage; partnership with a foreign touch",
      "sudden ups and downs, deep research and interest in the hidden",
      "fortune through foreign beliefs, mentors and unconventional dharma",
      "sudden rise in career, foreign companies and technology",
      "large, unconventional gains through networks and ambition",
      "foreign settlement, unusual expenditure and a secretive side",
    ],
    remedy:
      "Keep barley or mustard at home; donate to the needy on Saturdays; practise honesty and avoid addictions.",
    avoid: "Never lie, take intoxicants or cheat anyone.",
  },
  Ketu: {
    keyword: "detachment, insight and moksha",
    effect: [
      "a detached, spiritual personality with sharp intuition",
      "wealth comes and goes; simple speech and interest in the occult",
      "courage of conviction; gains through service and younger siblings",
      "inner peace over material comfort; an unusual home or property",
      "brilliant, non-conventional intelligence and spiritual children",
      "defeats enemies through detachment; healing and research",
      "a partner who brings spiritual change; marriage needs adjustment",
      "deep research, sudden insight and interest in moksha",
      "fortune through spirituality, detachment and a wise father",
      "career through research, healing or spiritual and technical work",
      "gains through selective networks and fulfilled detachment",
      "expenditure on spiritual pursuit; foreign lands and moksha leanings",
    ],
    remedy:
      "Feed stray dogs; donate a two-coloured blanket on Tuesdays; keep a small piece of silver with you.",
    avoid: "Never be cruel to animals or abandon your spiritual practice.",
  },
};

const PLANET_ORDER = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];

const ordinalHouse = (house) => {
  const suffix =
    house % 10 === 1 && house % 100 !== 11
      ? "st"
      : house % 10 === 2 && house % 100 !== 12
      ? "nd"
      : house % 10 === 3 && house % 100 !== 13
      ? "rd"
      : "th";
  return `${house}${suffix}`;
};

const GENERAL_RULES = [
  "A planet gives its results through the HOUSE it occupies, not merely through the sign it sits in.",
  "A planet behaves like a guest in someone else's house — it first serves the house lord, then gives its own results.",
  "Rahu and Ketu act through the planet they are associated with; their results follow that planet's house.",
  "Remedies are household acts — charity, service and observance — done consistently, not once.",
  "A planet placed in the 6th, 8th or 12th house is treated through service and charity rather than conflict.",
];

/**
 * Build the Lal Kitab report from already-computed chart planets.
 *
 * @param {object} params
 * @param {object} params.planets - chart.planets from calculateVedicChart:
 *   { Sun: { house, rashi, retrograde, ... }, ... }
 * @returns {object} payload for categories.lal_kitab
 */
const buildLalKitabReport = ({ planets = {} } = {}) => {
  const entries = PLANET_ORDER.map((name) => {
    const data = planets[name];
    if (!data) return null;
    const house = Number.isFinite(data.house) ? data.house : null;
    const rules = PLANET_RULES[name];
    if (!house || !rules) return null;

    const houseInfo = HOUSE_INFO[house];
    const status = data.isExalted
      ? "Exalted"
      : data.isDebilitated
      ? "Debilitated"
      : data.isOwnSign
      ? "Own sign"
      : data.retrograde || data.isRetrograde
      ? "Retrograde"
      : "Neutral";

    return {
      planet: name,
      house,
      houseOrdinal: ordinalHouse(house),
      lifeArea: houseInfo.area,
      sign: data.rashi || "",
      status,
      retrograde: Boolean(data.retrograde || data.isRetrograde),
      keyword: rules.keyword,
      prediction: `${name} in the ${ordinalHouse(house)} house ${rules.effect[house - 1]}.`,
      remedy: `${rules.remedy} ${houseInfo.remedy}`,
      avoid: rules.avoid,
      houseCharity: houseInfo.remedy,
    };
  }).filter(Boolean);

  return {
    title: "Lal Kitab",
    intro:
      "Lal Kitab reads each planet from the house it occupies and prescribes simple household remedies — charity, service and daily observance — to steady a troubled planet.",
    planets: entries,
    houseRemedies: Object.keys(HOUSE_INFO).map((key) => ({
      house: Number(key),
      area: HOUSE_INFO[key].area,
      remedy: HOUSE_INFO[key].remedy,
    })),
    generalRules: GENERAL_RULES,
    notes: [
      "Remedies are traditional Lal Kitab guidance; follow them with faith and consistency rather than as a guarantee of results.",
      "Read a planet's remedy together with its house — the house decides the life area the remedy protects.",
    ],
  };
};

module.exports = {
  HOUSE_INFO,
  PLANET_RULES,
  PLANET_ORDER,
  buildLalKitabReport,
};
