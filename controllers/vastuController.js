const { analyzeVastu } = require("../services/vastuService");

const cleanField = (value, maxLength) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

// POST /api/vastu/analyze
// multipart/form-data:
//   map   (required) floor-plan image
//   video (required) short house walkthrough video
//   notes, homeType, facing (optional text)
const analyze = async (req, res, next) => {
  try {
    const map = req.files?.map?.[0];
    const video = req.files?.video?.[0];

    if (!map) {
      return res.status(400).json({
        success: false,
        message: "Please upload a photo or screenshot of your floor map.",
      });
    }
    if (!video) {
      return res.status(400).json({
        success: false,
        message: "Please upload a short walkthrough video of your home.",
      });
    }

    const report = await analyzeVastu({
      map,
      video,
      notes: cleanField(req.body?.notes, 1000),
      homeType: cleanField(req.body?.homeType, 80),
      facing: cleanField(req.body?.facing, 80),
    });

    return res.json({
      success: true,
      message: "Vastu report generated",
      data: report,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { analyze };
