const test = require("node:test");
const assert = require("node:assert/strict");
const Questionnaire = require("../models/questionnaire");
const { register } = require("../controllers/authController");
const { createQuestionnaire, updateQuestionnaire } = require("../controllers/questionnaireController");

test("questionnaire model contains all 26 fields and allows partial answers during onboarding", () => {
  assert.equal(Questionnaire.fields.length, 26);
  assert.ok(Questionnaire.fields.includes("decisionMaking"));
  assert.ok(Questionnaire.fields.includes("longTermGoals"));

  const doc = new Questionnaire({
    user: "507f191e810c19729de860ea",
    decisionMaking: "Weigh options carefully with logic",
  });

  const validationError = doc.validateSync();
  assert.equal(validationError, undefined, "partial answers should not fail validation during onboarding");
  assert.equal(doc.isComplete(), false, "partial answers should not report isComplete as true");

  for (const field of Questionnaire.fields) {
    doc[field] = "Sample Answer";
  }
  assert.equal(doc.isComplete(), true, "all 26 answers filled should report isComplete as true");
});

test("authController and questionnaireController export expected handler functions", () => {
  assert.equal(typeof register, "function");
  assert.equal(typeof createQuestionnaire, "function");
  assert.equal(typeof updateQuestionnaire, "function");
});
