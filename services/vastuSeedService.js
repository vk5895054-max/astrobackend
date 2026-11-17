const VastuRule = require("../models/vastuRule");
const VastuReportTemplate = require("../models/vastuReportTemplate");
const defaultRules = require("../data/vastuRules.json");
const {
  validateConditions,
  DEFAULT_TEMPLATE_SECTIONS,
  DISCLAIMER,
} = require("./vastuRulesEngine");

const normalizeRule = (rule) => ({
  code: rule.code,
  title: rule.title,
  kind: rule.kind || "concern",
  category: rule.category || "general",
  zone: rule.zone || "",
  zoneKey: rule.zoneKey || "other",
  direction: rule.direction || "",
  concern: rule.concern || "moderate",
  explanation: rule.explanation || "",
  remedy: rule.remedy || "",
  source: rule.source || "",
  conditions: rule.conditions,
  appliesTo: rule.appliesTo || [],
  optional: rule.optional === true,
  enabled: rule.enabled !== false,
  isSystem: true,
  tags: rule.tags || [],
  notesForReviewer: rule.notesForReviewer || "",
  sortOrder: Number(rule.sortOrder) || 0,
  version: Number(rule.version) || 1,
});

/**
 * Seeds the default rule set. Uses $setOnInsert by default, so admin edits are
 * never overwritten. Pass { force: true } to reset the default rules.
 */
const seedVastuRules = async ({ force = false, createdBy = null } = {}) => {
  let inserted = 0;
  let updated = 0;
  let invalid = 0;

  for (const rule of defaultRules) {
    const conditionCheck = validateConditions(rule.conditions);
    if (!conditionCheck.valid) {
      invalid += 1;
      console.warn(`[Vastu] skipping invalid default rule ${rule.code}:`, conditionCheck.errors);
      continue;
    }

    const normalized = normalizeRule(rule);
    if (force) {
      const result = await VastuRule.updateOne(
        { code: normalized.code },
        { $set: { ...normalized, createdBy, updatedBy: createdBy } },
        { upsert: true },
      );
      if (result.upsertedCount) inserted += 1;
      else if (result.modifiedCount) updated += 1;
      continue;
    }

    const result = await VastuRule.updateOne(
      { code: normalized.code },
      {
        $setOnInsert: {
          ...normalized,
          createdBy,
          updatedBy: createdBy,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount) inserted += 1;
  }

  let template = await VastuReportTemplate.findOne({ isDefault: true });
  if (!template) {
    template = await VastuReportTemplate.create({
      name: "Default Vastu report",
      description: "Standard report layout used when no other template is selected.",
      isDefault: true,
      sections: DEFAULT_TEMPLATE_SECTIONS,
      disclaimer: DISCLAIMER,
      createdBy,
      updatedBy: createdBy,
    });
  }

  return {
    total: defaultRules.length,
    inserted,
    updated,
    invalid,
    templateId: template._id,
  };
};

// Lazily seed only when the collection is empty. An admin who intentionally
// disables every rule is not fighting a reseed on the next request.
const ensureVastuDefaults = async () => {
  const count = await VastuRule.countDocuments();
  if (count > 0) return { seeded: false, count };
  const result = await seedVastuRules();
  return { seeded: true, ...result };
};

module.exports = { seedVastuRules, ensureVastuDefaults };
