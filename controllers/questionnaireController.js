const Questionnaire = require("../models/questionnaire");
const questionnaireFields = Questionnaire.fields;
const buildData = (body) => Object.fromEntries(questionnaireFields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]));

const createQuestionnaire = async (req, res, next) => {
  try {
    const data = buildData(req.body);
    const questionnaire = await Questionnaire.findOneAndUpdate(
      { user: req.user._id },
      { $set: data },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true, message: "Questionnaire created", data: questionnaire });
  } catch (error) {
    next(error);
  }
};

const getMyQuestionnaire = async (req, res, next) => {
  try {
    const questionnaire = await Questionnaire.findOne({ user: req.user._id });
    if (!questionnaire) return res.status(404).json({ success: false, message: "Questionnaire not found" });
    res.json({ success: true, message: "Questionnaire retrieved", data: questionnaire });
  } catch (error) {
    next(error);
  }
};

const updateQuestionnaire = async (req, res, next) => {
  try {
    const data = buildData(req.body);
    const questionnaire = await Questionnaire.findOneAndUpdate(
      { user: req.user._id },
      { $set: data },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    if (!questionnaire) return res.status(404).json({ success: false, message: "Questionnaire not found" });
    res.json({ success: true, message: "Questionnaire updated", data: questionnaire });
  } catch (error) {
    next(error);
  }
};

module.exports = { createQuestionnaire, getMyQuestionnaire, updateQuestionnaire };