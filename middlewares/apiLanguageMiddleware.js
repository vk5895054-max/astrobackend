const { localizeApiResponse } = require("../services/apiLocalizationService");

const apiLanguageMiddleware = (req, res, next) => {
  const acceptLanguage = req.get("accept-language") || "";
  req.language = acceptLanguage.split(",")[0].trim();

  const originalJson = res.json;
  if (typeof res.vary === "function") res.vary("Accept-Language");
  res.json = function localizedJson(body) {
    return originalJson.call(
      this,
      localizeApiResponse(body, req.language),
    );
  };

  next();
};

module.exports = apiLanguageMiddleware;
