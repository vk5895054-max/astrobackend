const mongoose = require("mongoose");
const ReadingReport = require("../models/readingReport");
const { deleteReadingMedia } = require("../services/readingMediaService");
const { serializeReadingReport } = require("./readingController");

const buildError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
};

const createReadingAdminController = (feature) => {
  const getStats = async (req, res, next) => {
    try {
      const [byTier, totals] = await Promise.all([
        ReadingReport.aggregate([
          { $match: { feature } },
          { $group: { _id: "$tier", count: { $sum: 1 } } },
        ]),
        ReadingReport.aggregate([
          { $match: { feature } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              paid: { $sum: "$billing.charged" },
            },
          },
        ]),
      ]);

      const summary = { basic: 0, detailed: 0 };
      for (const item of byTier) summary[item._id] = item.count;
      const total = totals[0] || { total: 0, paid: 0 };

      return res.json({
        success: true,
        data: {
          feature,
          total: total.total,
          basic: summary.basic,
          detailed: summary.detailed,
          creditsCollected: total.paid || 0,
        },
      });
    } catch (error) {
      return next(error);
    }
  };

  const listReports = async (req, res, next) => {
    try {
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
        100
      );
      const filter = { feature };
      if (req.query.tier === "basic" || req.query.tier === "detailed") {
        filter.tier = req.query.tier;
      }
      if (req.query.search) {
        filter["report.summary"] = { $regex: req.query.search, $options: "i" };
      }

      const [items, total] = await Promise.all([
        ReadingReport.find(filter)
          .populate("user", "name email")
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        ReadingReport.countDocuments(filter),
      ]);

      return res.json({
        success: true,
        data: items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      });
    } catch (error) {
      return next(error);
    }
  };

  const getReport = async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        throw buildError("Invalid report ID.", 400);
      }
      const report = await ReadingReport.findOne({
        _id: req.params.id,
        feature,
      }).populate("user", "name email");
      if (!report) throw buildError("Report not found.", 404);
      return res.json({ success: true, data: serializeReadingReport(report) });
    } catch (error) {
      return next(error);
    }
  };

  const deleteReport = async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        throw buildError("Invalid report ID.", 400);
      }
      const report = await ReadingReport.findOne({ _id: req.params.id, feature });
      if (!report) throw buildError("Report not found.", 404);
      await Promise.all(
        (report.images || []).map((image) =>
          deleteReadingMedia(image).catch(() => false)
        )
      );
      await ReadingReport.deleteOne({ _id: report._id });
      return res.json({
        success: true,
        message: "Report deleted",
      });
    } catch (error) {
      return next(error);
    }
  };

  return { getStats, listReports, getReport, deleteReport };
};

module.exports = { createReadingAdminController };
