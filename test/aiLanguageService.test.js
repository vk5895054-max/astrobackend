const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getResponseLanguageInstruction,
  withResponseLanguage,
} = require("../services/aiLanguageService");

test("AI response language follows the app locale", () => {
  assert.match(getResponseLanguageInstruction("en-US"), /entirely in English/);
  assert.match(getResponseLanguageInstruction("hi-IN"), /Hindi using Devanagari/);
  assert.match(getResponseLanguageInstruction("en-IN"), /natural Hinglish/);
  assert.match(getResponseLanguageInstruction("en"), /entirely in English/);
});

test("language instructions are appended to the system prompt", () => {
  const prompt = withResponseLanguage("Base instructions.", "hi-IN");

  assert.match(prompt, /^Base instructions\./);
  assert.match(prompt, /Response language:\nRespond entirely in Hindi/);
});
