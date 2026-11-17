const mongoose = require("mongoose");
const VastuRule = require("../models/vastuRule");
const VastuReportTemplate = require("../models/vastuReportTemplate");
const VastuRequest = require("../models/vastuRequest");
const VastuReport = require("../models/vastuReport");
const {
  FIELD_REGISTRY,
  DIRECTIONS,
  PROPERTY_TYPES,
  RULE_CATEGORIES,
  ZONE_KEYS,
  CONDITION_OPS,
  DEFAULT_TEMPLATE_SECTIONS,
  normalizeDirection,
  normalizeConcern,
  normalizePropertyInput,
  normalizeBirthDetails,
  validateConditions,
  evaluateRules,
  buildZoneAnalysis,
  buildDirectionalAssessment,
  buildElementBalance,
  concernLabel,
  titleCase,
} = require("../services/vastuRulesEngine");
const { seedVastuRules } = require("../services/vastuSeedService");
const { buildError, toPlain } = require("../services/vastuWorkflowService");

const ensureObjectId = (value, label = "rule ID") => {
  if (!mongoose.isValidObjectId(value)) throw buildError(`Invalid ${label}.`);
};

const cleanText = (value, maxLength) => {
  if (value == null) return "";
  return String(value).trim().slice(0, maxLength);
};

const normalizeStringArray = (value, allowed) => {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : String(value).split(",");
  const normalized = list
    .map((item) => cleanText(item, 80).toLowerCase())
    .filter(Boolean)
    .filter((item) => !allowed || allowed.includes(item));
  return [...new Set(normalized)];
};

const rulePayload = (body = {}, { partial = false } = {}) => {
  const payload = {};

  if (!partial || body.code !== undefined) {
    const code = cleanText(body.code, 80).toLowerCase();
    if (!code) throw buildError("Rule code is required.");
    payload.code = code;
  }
  if (!partial || body.title !== undefined) {
    const title = cleanText(body.title, 160);
    if (!title) throw buildError("Rule title is required.");
    payload.title = title;
  }
  if (body.kind !== undefined || !partial) {
    payload.kind = body.kind === "strength" ? "strength" : "concern";
  }
  if (!partial || body.category !== undefined) {
    const category = cleanText(body.category, 80).toLowerCase();
    if (!RULE_CATEGORIES.includes(category)) throw buildError("Rule category is not recognised.");
    payload.category = category;
  }
  if (body.zone !== undefined || !partial) payload.zone = cleanText(body.zone, 120);
  if (body.zoneKey !== undefined || !partial) {
    const zoneKey = cleanText(body.zoneKey, 80).toLowerCase() || "other";
    if (!ZONE_KEYS.includes(zoneKey)) throw buildError("Rule zoneKey is not recognised.");
    payload.zoneKey = zoneKey;
  }
  if (body.direction !== undefined || !partial) {
    const raw = cleanText(body.direction, 40);
    const direction = raw ? normalizeDirection(raw) : "";
    if (raw && !direction) throw buildError("Rule direction must be a valid direction or empty.");
    payload.direction = direction;
  }
  if (body.concern !== undefined || !partial) {
    payload.concern = normalizeConcern(body.concern || "moderate");
  }
  if (!partial || body.explanation !== undefined) {
    const explanation = cleanText(body.explanation || body.description, 4000);
    if (!explanation) throw buildError("Rule explanation is required.");
    payload.explanation = explanation;
  }
  if (body.remedy !== undefined || !partial) payload.remedy = cleanText(body.remedy, 4000);
  if (body.source !== undefined || !partial) payload.source = cleanText(body.source, 500);
  if (body.notesForReviewer !== undefined || !partial) {
    payload.notesForReviewer = cleanText(body.notesForReviewer, 2000);
  }
  if (body.tags !== undefined || !partial) {
    payload.tags = normalizeStringArray(body.tags);
  }
  if (body.appliesTo !== undefined || !partial) {
    payload.appliesTo = normalizeStringArray(body.appliesTo, PROPERTY_TYPES);
  }
  if (body.optional !== undefined || !partial) payload.optional = body.optional === true;
  if (body.enabled !== undefined || !partial) payload.enabled = body.enabled !== false;
  if (body.sortOrder !== undefined || !partial) {
    const order = Number(body.sortOrder);
    payload.sortOrder = Number.isFinite(order) ? order : 0;
  }

  if (!partial || body.conditions !== undefined) {
    const conditions = body.conditions;
    const check = validateConditions(conditions);
    if (!check.valid) {
      const error = buildError(`Invalid rule conditions: ${check.errors.join(" ")}`);
      error.errors = check.errors;
      throw error;
    }
    payload.conditions = conditions;
  }

  return payload;
};

const listRules = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.enabled !== undefined) filter.enabled = req.query.enabled !== "false";
    if (req.query.kind) filter.kind = req.query.kind;
    if (req.query.zoneKey) filter.zoneKey = req.query.zoneKey;
    if (req.query.search) {
      const search = String(req.query.search).trim().slice(0, 100);
      filter.$or = [
        { code: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { explanation: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    const [rules, total] = await Promise.all([
      VastuRule.find(filter)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .sort({ sortOrder: 1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      VastuRule.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      message: "Vastu rules retrieved",
      data: rules,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    return next(error);
  }
};

const getRule = async (req, res, next) => {
  try {
    ensureObjectId(req.params.ruleId);
    const rule = await VastuRule.findById(req.params.ruleId).lean();
    if (!rule) throw buildError("Vastu rule not found.", 404);
    return res.json({ success: true, message: "Vastu rule retrieved", data: rule });
  } catch (error) {
    return next(error);
  }
};

const createRule = async (req, res, next) => {
  try {
    const payload = rulePayload(req.body || {});
    const rule = await VastuRule.create({
      ...payload,
      isSystem: false,
      version: 1,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    return res.status(201).json({
      success: true,
      message: "Vastu rule created",
      data: toPlain(rule),
    });
  } catch (error) {
    return next(error);
  }
};

const updateRule = async (req, res, next) => {
  try {
    ensureObjectId(req.params.ruleId);
    const rule = await VastuRule.findById(req.params.ruleId);
    if (!rule) throw buildError("Vastu rule not found.", 404);

    const payload = rulePayload(req.body || {}, { partial: true });
    Object.assign(rule, payload);
    rule.version = (rule.version || 1) + 1;
    rule.updatedBy = req.user._id;
    await rule.save();

    return res.json({
      success: true,
      message: "Vastu rule updated",
      data: toPlain(rule),
    });
  } catch (error) {
    return next(error);
  }
};

const setRuleEnabled = async (req, res, next) => {
  try {
    ensureObjectId(req.params.ruleId);
    if (typeof req.body?.enabled !== "boolean") {
      throw buildError("`enabled` must be true or false.");
    }
    const rule = await VastuRule.findByIdAndUpdate(
      req.params.ruleId,
      { enabled: req.body.enabled, updatedBy: req.user._id, $inc: { version: 1 } },
      { new: true, runValidators: true },
    );
    if (!rule) throw buildError("Vastu rule not found.", 404);
    return res.json({
      success: true,
      message: rule.enabled ? "Vastu rule enabled" : "Vastu rule disabled",
      data: toPlain(rule),
    });
  } catch (error) {
    return next(error);
  }
};

const deleteRule = async (req, res, next) => {
  try {
    ensureObjectId(req.params.ruleId);
    const rule = await VastuRule.findById(req.params.ruleId);
    if (!rule) throw buildError("Vastu rule not found.", 404);

    if (rule.isSystem && req.query.soft !== "false") {
      rule.enabled = false;
      rule.updatedBy = req.user._id;
      rule.version = (rule.version || 1) + 1;
      await rule.save();
      return res.json({
        success: true,
        message: "System rule disabled (use ?soft=false to delete it permanently).",
        data: toPlain(rule),
      });
    }

    await VastuRule.deleteOne({ _id: rule._id });
    return res.json({ success: true, message: "Vastu rule deleted", data: { id: String(rule._id) } });
  } catch (error) {
    return next(error);
  }
};

const getRuleFields = async (req, res, next) => {
  try {
    return res.json({
      success: true,
      message: "Vastu rule fields retrieved",
      data: {
        fields: FIELD_REGISTRY,
        directions: DIRECTIONS,
        propertyTypes: PROPERTY_TYPES,
        categories: RULE_CATEGORIES,
        zoneKeys: ZONE_KEYS,
        operators: CONDITION_OPS,
        concernLevels: ["low", "moderate", "high"],
        concernLabels: {
          low: concernLabel("low"),
          moderate: concernLabel("moderate"),
          high: concernLabel("high"),
        },
        templateSections: DEFAULT_TEMPLATE_SECTIONS,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const validateRuleConditions = async (req, res, next) => {
  try {
    const check = validateConditions(req.body?.conditions);
    return res.status(check.valid ? 200 : 422).json({
      success: check.valid,
      message: check.valid ? "Conditions are valid" : "Conditions are invalid",
      data: check,
    });
  } catch (error) {
    return next(error);
  }
};

const previewRule = async (req, res, next) => {
  try {
    const normalized = normalizePropertyInput(req.body?.input || req.body?.property || {});
    if (normalized.errors.length) {
      return res.status(400).json({
        success: false,
        message: normalized.errors.map((item) => item.message).join(" "),
        errors: normalized.errors,
      });
    }
    const birth = normalizeBirthDetails(req.body?.birthDetails || {});
    if (birth.errors.length) {
      return res.status(400).json({
        success: false,
        message: birth.errors.map((item) => item.message).join(" "),
        errors: birth.errors,
      });
    }

    let rules;
    if (Array.isArray(req.body?.ruleIds) && req.body.ruleIds.length) {
      for (const id of req.body.ruleIds) ensureObjectId(id);
      rules = await VastuRule.find({ _id: { $in: req.body.ruleIds } }).lean();
    } else {
      rules = await VastuRule.find({ enabled: true }).sort({ sortOrder: 1 }).lean();
    }

    const evaluation = evaluateRules(rules, normalized.value, birth.value);
    return res.json({
      success: true,
      message: "Rule preview evaluated",
      data: {
        input: normalized.value,
        findings: evaluation.findings,
        strengths: evaluation.strengths,
        missingFields: evaluation.missingFields,
        unverifiedRules: evaluation.unverifiedRules,
        skippedRules: evaluation.skippedRules,
        zoneAnalysis: buildZoneAnalysis(normalized.value, evaluation.findings),
        directionalAssessment: buildDirectionalAssessment(normalized.value, evaluation.findings),
        elementBalance: buildElementBalance(normalized.value),
      },
    });
  } catch (error) {
    return next(error);
  }
};

const seedRules = async (req, res, next) => {
  try {
    const result = await seedVastuRules({
      force: req.body?.force === true,
      createdBy: req.user._id,
    });
    return res.json({ success: true, message: "Default Vastu rules seeded", data: result });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// Report templates
// ---------------------------------------------------------------------------

const normalizeSections = (value) => {
  if (value == null) return null;
  if (!Array.isArray(value) || !value.length) {
    throw buildError("Template sections must be a non-empty array.");
  }
  const allowed = new Set(DEFAULT_TEMPLATE_SECTIONS.map((section) => section.key));
  const seen = new Set();
  return value.map((section, index) => {
    const key = cleanText(section?.key, 80).toLowerCase();
    if (!allowed.has(key)) throw buildError(`Unknown report section: ${key || "(empty)"}`);
    if (seen.has(key)) throw buildError(`Duplicate report section: ${key}`);
    seen.add(key);
    return {
      key,
      title: cleanText(section?.title, 160) || titleCase(key),
      enabled: section?.enabled !== false,
      order: Number.isFinite(Number(section?.order)) ? Number(section.order) : (index + 1) * 10,
    };
  });
};

const templatePayload = (body = {}, { partial = false } = {}) => {
  const payload = {};
  if (!partial || body.name !== undefined) {
    const name = cleanText(body.name, 120);
    if (!name) throw buildError("Template name is required.");
    payload.name = name;
  }
  if (body.description !== undefined || !partial) payload.description = cleanText(body.description, 1000);
  if (body.disclaimer !== undefined || !partial) payload.disclaimer = cleanText(body.disclaimer, 2000);
  if (body.footerNote !== undefined || !partial) payload.footerNote = cleanText(body.footerNote, 1000);
  if (body.isDefault !== undefined || !partial) payload.isDefault = body.isDefault === true;
  if (body.sections !== undefined || !partial) {
    payload.sections = normalizeSections(body.sections) || DEFAULT_TEMPLATE_SECTIONS;
  }
  return payload;
};

const listTemplates = async (req, res, next) => {
  try {
    const templates = await VastuReportTemplate.find()
      .sort({ isDefault: -1, createdAt: 1 })
      .lean();
    return res.json({ success: true, message: "Report templates retrieved", data: templates });
  } catch (error) {
    return next(error);
  }
};

const createTemplate = async (req, res, next) => {
  try {
    const payload = templatePayload(req.body || {});
    if (payload.isDefault) {
      await VastuReportTemplate.updateMany({}, { $set: { isDefault: false } });
    }
    const template = await VastuReportTemplate.create({
      ...payload,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    return res.status(201).json({
      success: true,
      message: "Report template created",
      data: toPlain(template),
    });
  } catch (error) {
    return next(error);
  }
};

const updateTemplate = async (req, res, next) => {
  try {
    ensureObjectId(req.params.templateId, "template ID");
    const template = await VastuReportTemplate.findById(req.params.templateId);
    if (!template) throw buildError("Report template not found.", 404);
    const payload = templatePayload(req.body || {}, { partial: true });
    if (payload.isDefault === true) {
      await VastuReportTemplate.updateMany(
        { _id: { $ne: template._id } },
        { $set: { isDefault: false } },
      );
    }
    Object.assign(template, payload);
    template.updatedBy = req.user._id;
    await template.save();
    return res.json({
      success: true,
      message: "Report template updated",
      data: toPlain(template),
    });
  } catch (error) {
    return next(error);
  }
};

const deleteTemplate = async (req, res, next) => {
  try {
    ensureObjectId(req.params.templateId, "template ID");
    const template = await VastuReportTemplate.findById(req.params.templateId);
    if (!template) throw buildError("Report template not found.", 404);
    if (template.isDefault) {
      throw buildError("Choose another default template before deleting this one.", 409);
    }
    await VastuReportTemplate.deleteOne({ _id: template._id });
    return res.json({
      success: true,
      message: "Report template deleted",
      data: { id: String(template._id) },
    });
  } catch (error) {
    return next(error);
  }
};

const getStats = async (req, res, next) => {
  try {
    const [statusCounts, rules, templates, reports] = await Promise.all([
      VastuRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      VastuRule.aggregate([
        { $group: { _id: { enabled: "$enabled", kind: "$kind" }, count: { $sum: 1 } } },
      ]),
      VastuReportTemplate.countDocuments(),
      VastuReport.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    const byStatus = {};
    for (const item of statusCounts) byStatus[item._id] = item.count;

    return res.json({
      success: true,
      message: "Vastu stats retrieved",
      data: {
        requests: {
          total: statusCounts.reduce((total, item) => total + item.count, 0),
          byStatus,
        },
        reports: {
          total: reports.reduce((total, item) => total + item.count, 0),
          byStatus: Object.fromEntries(reports.map((item) => [item._id, item.count])),
        },
        rules: {
          total: rules.reduce((total, item) => total + item.count, 0),
          enabled: rules.filter((item) => item._id.enabled).reduce((total, item) => total + item.count, 0),
          strengths: rules.filter((item) => item._id.kind === "strength").reduce((total, item) => total + item.count, 0),
          concerns: rules.filter((item) => item._id.kind !== "strength").reduce((total, item) => total + item.count, 0),
        },
        templates,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listRules,
  getRule,
  createRule,
  updateRule,
  setRuleEnabled,
  deleteRule,
  getRuleFields,
  validateRuleConditions,
  previewRule,
  seedRules,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getStats,
};
