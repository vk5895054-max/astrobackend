const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLogoDesign,
  buildMonogram,
  muhuratNumber,
  normalizeLogoInput,
} = require("../services/logo/logoDesignService");

const validInput = {
  fullName: "Riya Mehta",
  companyName: "Aarav Studio",
  dateOfBirth: "1995-08-23",
  birthTime: "09:15",
  location: "Ahmedabad",
};

test("normalizes a valid logo request", () => {
  const result = normalizeLogoInput({
    ...validInput,
    fullName: "  Riya   Mehta ",
    birthTime: "9:05",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.fullName, "Riya Mehta");
  assert.equal(result.value.birthTime, "09:05");
  assert.equal(result.value.dateOfBirth.toISOString().slice(0, 10), "1995-08-23");
});

test("rejects missing or malformed fields", () => {
  assert.match(normalizeLogoInput({ ...validInput, fullName: "" }).error, /fullName/);
  assert.match(normalizeLogoInput({ ...validInput, companyName: "" }).error, /companyName/);
  assert.match(normalizeLogoInput({ ...validInput, dateOfBirth: "31/02/1995" }).error, /dateOfBirth/);
  assert.match(normalizeLogoInput({ ...validInput, birthTime: "24:00" }).error, /birthTime/);
  assert.match(normalizeLogoInput({ ...validInput, location: "" }).error, /location/);
});

test("builds a monogram from company words", () => {
  assert.equal(buildMonogram("Aarav Studio", "Riya Mehta"), "AS");
  assert.equal(buildMonogram("Nimbus", "Riya Mehta"), "NI");
  assert.equal(buildMonogram("  ", "Riya Mehta"), "RM");
});

test("derives a muhurat number from the birth time", () => {
  assert.equal(muhuratNumber("09:15"), 6);
  assert.equal(muhuratNumber("00:00"), 9);
  assert.equal(muhuratNumber("bad"), null);
});

test("builds a complete design with three renderable variants", () => {
  const design = buildLogoDesign(validInput);

  assert.equal(design.companyName, "Aarav Studio");
  assert.equal(design.monogram, "AS");
  assert.equal(design.dateOfBirth, "1995-08-23");
  assert.equal(design.numbers.mulank.value, 5);
  assert.ok(design.numbers.bhagyank.value > 0);
  assert.ok(design.numbers.nameNumber.value > 0);
  assert.equal(design.numbers.muhurat.value, 6);

  assert.equal(design.variants.length, 3);
  assert.deepEqual(
    design.variants.map((variant) => variant.style),
    ["monogram", "emblem", "wordmark"],
  );

  for (const variant of design.variants) {
    assert.match(variant.colors.primary, /^#[0-9A-F]{6}$/i);
    assert.match(variant.colors.secondary, /^#[0-9A-F]{6}$/i);
    assert.match(variant.colors.accent, /^#[0-9A-F]{6}$/i);
    assert.match(variant.colors.ink, /^#[0-9A-F]{6}$/i);
    assert.ok(variant.motif);
    assert.ok(variant.tagline);
    assert.equal(variant.companyName, "Aarav Studio");
  }

  assert.ok(design.tagline.length > 0);
  assert.ok(design.concept.includes("Aarav Studio"));
  assert.ok(design.whyItFits.length >= 3);
});

test("keeps working when the company name has no Latin letters", () => {
  const design = buildLogoDesign({
    ...validInput,
    companyName: "आरव स्टूडियो",
  });
  assert.equal(design.variants.length, 3);
  assert.ok(design.numbers.nameNumber.value > 0);
  assert.ok(design.monogram.length >= 1 && design.monogram.length <= 2);
});

test("preserves master numbers 11 and 22", () => {
  const eleven = buildLogoDesign({ ...validInput, dateOfBirth: "1990-11-29" });
  assert.equal(eleven.numbers.mulank.value, 11);

  const twentyTwo = buildLogoDesign({ ...validInput, dateOfBirth: "1990-11-22" });
  assert.equal(twentyTwo.numbers.mulank.value, 22);
});
