/**
 * Shared single-select focus values used by the Flutter app for face, palm and
 * Vastu readings. The app sends stable slugs so the prompt text does not depend
 * on the device language; here they are expanded into readable English.
 *
 * Legacy free text from older app versions is still accepted unchanged.
 */
const FOCUS_LABELS = {
  career: "Career and business growth",
  money: "Money and wealth",
  health: "Health and energy",
  relationships: "Love and relationships",
  family: "Family and home life",
  studies: "Studies and focus",
};

/**
 * @param {unknown} value raw request field (`notes` / `concern`)
 * @param {number} maxLength maximum length of the returned text
 * @returns {string} readable focus text, or an empty string
 */
function normalizeFocusText(value, maxLength = 1000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const mapped = FOCUS_LABELS[trimmed];
  return (mapped || trimmed).slice(0, maxLength);
}

module.exports = { FOCUS_LABELS, normalizeFocusText };
