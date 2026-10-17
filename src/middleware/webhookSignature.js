'use strict';

const crypto = require('crypto');
const config = require('../config');

/**
 * WebhookSignatureMiddleware (#474)
 *
 * Validates incoming webhook signatures to prevent forged webhooks.
 * Uses HMAC-SHA256 with the configured webhook secret.
 *
 * Expects the signature in the `X-Webhook-Signature` header in the format
 * `sha256=<hex digest>`. The signature is computed over the raw request body.
 */
function webhookSignatureMiddleware(req, res, next) {
  const signature = req.headers['x-webhook-signature'];
  const secret = config.webhooks?.signatureSecret;

  if (!secret) {
    // If no secret is configured, reject incoming webhooks to fail closed.
    return res.status(403).json({
      statusCode: 403,
      error: 'Webhook signature verification failed',
      message: 'Webhook signature validation is not configured.',
    });
  }

  if (!signature) {
    return res.status(401).json({
      statusCode: 401,
      error: 'Missing webhook signature',
      message: 'X-Webhook-Signature header is required.',
    });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    return res.status(400).json({
      statusCode: 400,
      error: 'Invalid request',
      message: 'Raw body is required for signature verification.',
    });
  }

  const expectedSignature =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Constant-time comparison to prevent timing attacks.
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({
      statusCode: 401,
      error: 'Invalid webhook signature',
      message: 'Signature verification failed.',
    });
  }

  next();
}

module.exports = { webhookSignatureMiddleware };
