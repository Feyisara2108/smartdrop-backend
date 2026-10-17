'use strict';

const logger = require('../logger');

/**
 * #454 — Database transaction manager with guaranteed rollback and error preservation.
 *
 * Root causes of transaction rollback failure in previous implementations:
 * 1. Queries inside the transaction were executed against the connection pool (db / getDb())
 *    rather than the transaction client (trx), causing queries to auto-commit on the pool
 *    outside the transaction scope.
 * 2. In some error paths, errors were caught and swallowed, or if rollback itself failed
 *    (e.g. broken connection), the rollback error replaced the original application error.
 * 3. Leaked connections when an unhandled exception occurred and rollback was omitted or
 *    not awaited in the error path.
 *
 * This wrapper guarantees:
 * - The callback receives the transaction client `trx` which must be used for all transactional queries.
 * - Any error thrown inside the callback triggers an immediate `trx.rollback()`.
 * - The ORIGINAL error thrown by the callback is ALWAYS rethrown (never replaced by a rollback error).
 * - Connections are ALWAYS released back to the pool in the finally block.
 * - Supports nested transactions via Knex savepoints.
 */

/**
 * Execute a callback within an atomic database transaction.
 *
 * @param {import('knex').Knex} db - The Knex database instance
 * @param {Function} callback - Async function receiving `(trx)` to execute transactional queries
 * @param {Object} [options] - Optional transaction configuration
 * @param {import('knex').Knex.Transaction} [options.trx] - Existing transaction for nesting
 * @param {string} [options.isolationLevel] - Optional SQL isolation level
 * @returns {Promise<*>} The result of the callback
 */
async function withTransaction(db, callback, options = {}) {
  if (!db || typeof db !== 'function') {
    throw new Error('withTransaction: valid Knex database instance is required');
  }
  if (typeof callback !== 'function') {
    throw new Error('withTransaction: callback function is required');
  }

  // If already inside an existing transaction, support nested savepoints
  if (options.trx) {
    const parentTrx = options.trx;
    // Knex transaction() on an existing trx creates a SAVEPOINT
    const savepoint = await parentTrx.transaction();
    let completed = false;
    try {
      const result = await callback(savepoint);
      if (!savepoint.isCompleted()) {
        await savepoint.commit();
      }
      completed = true;
      return result;
    } catch (err) {
      if (!completed && !savepoint.isCompleted()) {
        try {
          await savepoint.rollback();
        } catch (rollbackErr) {
          logger.warn('Savepoint rollback error (suppressed, preserving original)', {
            error: rollbackErr.message,
          });
        }
      }
      throw err;
    }
  }

  // Start a new transaction
  const trxConfig = {};
  if (options.isolationLevel) {
    trxConfig.isolationLevel = options.isolationLevel;
  }

  const trx = await db.transaction(trxConfig);
  let committed = false;

  try {
    const result = await callback(trx);
    if (!trx.isCompleted()) {
      await trx.commit();
    }
    committed = true;
    return result;
  } catch (err) {
    if (!committed && !trx.isCompleted()) {
      try {
        await trx.rollback();
      } catch (rollbackErr) {
        // Log rollback error but NEVER let it mask the original error
        logger.warn('Transaction rollback error (suppressed, preserving original)', {
          original_error: err.message,
          rollback_error: rollbackErr.message,
        });
      }
    }
    // Always rethrow the original error
    throw err;
  } finally {
    // Safety check: ensure connection is released if something went wrong before commit/rollback
    if (!trx.isCompleted()) {
      try {
        await trx.rollback();
      } catch (_) {
        // Ignore in cleanup
      }
    }
  }
}

module.exports = {
  withTransaction,
};
