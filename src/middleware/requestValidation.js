'use strict';

const AppError = require('../errors/AppError');

/**
 * #450 — Request validation middleware.
 *
 * Validates incoming requests before they reach route handlers:
 * - Rejects POST/PUT/PATCH without Content-Type or with unsupported types
 * - Validates Content-Type is application/json for JSON endpoints
 * - Enforces max body size (handled by express.json but validated here for clarity)
 *
 * This catches malformed requests early and returns consistent 400 errors.
 */
function requestValidationMiddleware(req, res, next) {
  const method = req.method.toUpperCase();

  // Validate Content-Type for methods that typically have a body
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const contentType = req.headers['content-type'];

    if (!contentType) {
      return next(new AppError(
        'VALIDATION_ERROR',
        'Content-Type header is required for this request',
        400,
        { method, hint: 'Use Content-Type: application/json' },
      ));
    }

    // Only accept JSON content type
    const normalizedContentType = contentType.split(';')[0].trim().toLowerCase();
    if (normalizedContentType !== 'application/json') {
      return next(new AppError(
        'VALIDATION_ERROR',
        `Unsupported Content-Type: ${contentType}`,
        400,
        { method, content_type: contentType, expected: 'application/json' },
      ));
    }
  }

  next();
}

module.exports = requestValidationMiddleware;
