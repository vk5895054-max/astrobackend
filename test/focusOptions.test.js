const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeFocusText } = require("../services/focusOptions");

test("maps app focus slugs to readable prompt text", () => {
  assert.equal(
    normalizeFocusText("career"),
    "Career and business growth",
  );
  assert.equal(
    normalizeFocusText("relationships"),
    "Love and relationships",
  );
  assert.equal(normalizeFocusText("studies"), "Studies and focus");
  assert.equal(
    normalizeFocusText("drawing_colors"),
    "Colour choices and visible use of colour",
  );
  assert.equal(
    normalizeFocusText("drawing_composition"),
    "Composition, space and layout of the drawing",
  );
});

test("keeps legacy free text and ignores empty or invalid values", () => {
  assert.equal(normalizeFocusText("  my own question  "), "my own question");
  assert.equal(normalizeFocusText(""), "");
  assert.equal(normalizeFocusText(null), "");
  assert.equal(normalizeFocusText(42), "");
  assert.equal(normalizeFocusText("money", 5), "Money");
});
