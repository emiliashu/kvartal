const HttpError = require("../utils/http-error");

module.exports = function validate(schema, source = "body") {
  return function validationMiddleware(req, _res, next) {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new HttpError(400, "Validation failed", result.error.flatten()));
    }

    req.validated = req.validated || {};
    req.validated[source] = result.data;
    return next();
  };
};
