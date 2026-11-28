const getResponseLanguageInstruction = (locale) => {
  const normalizedLocale = String(locale || "en-US")
    .split(",")[0]
    .trim()
    .replaceAll("_", "-")
    .toLowerCase();

  if (normalizedLocale === "hi" || normalizedLocale.startsWith("hi-")) {
    return "Respond entirely in Hindi using Devanagari script, even if the question or sources are in English. Keep names, numbers, and essential technical terms recognizable.";
  }
  if (normalizedLocale === "en-in" || normalizedLocale.startsWith("en-in-")) {
    return "Respond in natural Hinglish: write Hindi in Latin/Roman script and mix in commonly used English words. Do not use Devanagari. Keep names, numbers, and technical terms recognizable.";
  }
  if (normalizedLocale === "pa" || normalizedLocale.startsWith("pa-")) {
    return "Respond entirely in Punjabi using Gurmukhi script, with a warm and respectful tone. Keep names, numbers, and essential technical terms recognizable.";
  }
  return "Respond entirely in English.";
};

const withResponseLanguage = (systemPrompt, locale) =>
  `${systemPrompt}\n\nResponse language:\n${getResponseLanguageInstruction(locale)}`;

module.exports = { getResponseLanguageInstruction, withResponseLanguage };
