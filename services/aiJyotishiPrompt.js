// Prompt contract for every AI Jyotishi. Kept verbatim so an admin cannot
// quietly drop the safety lines while editing a persona.
const PERSONA_TEMPLATE = `Tum {naam} ho, ek AI jyotishi. Expertise: {expertise}. Andaz: {style}.
User ki bhasha mein, anubhavi jyotishi ki tarah apnepan se, chhote jawab do.
Sirf di gayi kundli data ke aadhar par baat karo. Zarurat ho to ek sawal poochho.
Khud ko insaan mat batao. Koi pooche to saaf kaho ki tum AI ho.
Pakki bhavishyavani ya guarantee mat do.
Maut, bimari ya anhoni ka dar mat dikhao. Mehenge upay ya recharge ka dabav mat banao.
Health, kanoon aur paise ke faislon ke liye expert se milne ko kaho.
Koi atmahatya ya khud ko nuksan ki baat kare to jyotish rok kar turant madad lene ko kaho, Tele-MANAS 14416 do, aur billing band karo.`;

const buildSystemPrompt = (profile) =>
  PERSONA_TEMPLATE.replace("{naam}", profile.name || "AI Jyotishi")
    .replace("{expertise}", (profile.expertise || []).join(", ") || "general jyotish")
    .replace("{style}", profile.style || "shaant aur apnepan wala")
    .concat(
      "\n\nTumhare paas sirf neeche di gayi kundli data hai. Agar koi grah/Lagna ki jaankari neeche nahi hai to uske baare mein kuch mat banao. " +
        "Kisi bhi recharge, payment ya billing ka zikr mat karo.",
    );

// Crisis detection is intentionally broad: it runs before the model call and
// stops billing immediately. It never tries to interpret or "read" the chart.
const CRISIS_PATTERNS = [
  /\bsuicide\b|\bkill myself\b|\bend my life\b|\bself[- ]?harm\b|\bhurt myself\b/i,
  /आत्महत्या|आत्म-?हत्या|आपघात|खुद\s+को\s+(मार|नुकसान|चोट)|जान\s+देना/i,
  /aatmahatya|aapghat|khud ko (mar|nuksan|chot)|apni jaan dena|jaan de raha/i,
  /ਆਤਮਹੱਤਿਆ|ਖੁਦ\s+ਕੁੱਝ|ਆਪਣੀ\s+ਜਾਨ/i,
];

const detectSafetyCrisis = (text) => {
  const value = String(text || "");
  if (!value.trim()) return false;
  return CRISIS_PATTERNS.some((pattern) => pattern.test(value));
};

const SUPPORT_MESSAGE =
  "Mujhe afsoos hai ki tum itni mushkil mein ho. Main jyotish ab rok raha hoon — abhi kisi jyotish ya recharge ki baat nahi karni. " +
  "Kripya turant kisi bharose ke vyakti ko bulao ya turant medical help lo. Tele-MANAS par 14416 call ya WhatsApp karo — ye 24x7 free hai. " +
  "Agar tumhe turant khatra lag raha hai to apne paas ke hospital ya emergency number par jao.";

// Only server-computed ephemeris values are placed in front of the model.
// Missing birth time/location stays missing instead of becoming a default chart.
const buildKundliContext = (kundli) => {
  if (!kundli) return "Kundli data available nahi hai. Kisi bhi grah ya Lagna ka zikr mat karo.";
  const summary = kundli.summary || {};
  const planets = kundli.planets || {};
  const lines = [
    `Naam: ${summary.name || "User"}`,
    `Janm tareekh: ${summary.dob || "unknown"}`,
    `Janm samay: ${summary.timeOfBirthProvided ? summary.tob || "unknown" : "unknown"}`,
    `Sthan: ${summary.place || "unknown"}`,
  ];
  if (summary.ascendantAvailable && summary.lagna) {
    lines.push(`Lagna: ${summary.lagna}`);
  } else {
    lines.push("Lagna: unavailable (janm samay confirmed nahi hai — is par kuch mat bolna)");
  }
  if (summary.rashi) lines.push(`Chandra rashi: ${summary.rashi}`);
  if (summary.nakshatra) lines.push(`Nakshatra: ${summary.nakshatra}`);
  if (summary.precision) lines.push(`Chart precision: ${summary.precision}`);
  const placements = Object.entries(planets)
    .filter(([, value]) => value && value.rashi)
    .map(([name, value]) => {
      const degree = Number.isFinite(value.degreeInSign)
        ? ` ${Math.floor(value.degreeInSign)}°`
        : "";
      const retro = value.retrograde ? " (vakri)" : "";
      return `${name}: ${value.rashi}${degree}${retro}`;
    });
  if (placements.length) lines.push(`Grah sthiti: ${placements.join(", ")}`);
  if (summary.note) lines.push(`Note: ${summary.note}`);
  lines.push("Sirf inhi values ka istemal karo. Koi naya grah, dosh ya yog mat banao.");
  return lines.join("\n");
};

module.exports = {
  PERSONA_TEMPLATE,
  buildSystemPrompt,
  detectSafetyCrisis,
  SUPPORT_MESSAGE,
  buildKundliContext,
};
