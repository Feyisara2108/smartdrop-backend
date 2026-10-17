'use strict';

const knexFactory = require('knex');
const config = require('../config');
const {
  withTransaction,
  isDeadlockOrSerializationError,
  sortIds,
  lockRows,
} = require('./transaction');

let db = null;

/**
 * Get or initialize the shared Knex database singleton.
 *
 * @param {Object} [overrideConfig] - Optional configuration overrides (useful for testing)
 * @returns {import('knex').Knex}
 */
function getDb(overrideConfig = {}) {
  if (!db) {
    db = knexFactory({
      client: 'pg',
      connection: overrideConfig.connection || config.databaseUrl,
      pool: overrideConfig.pool || { min: 2, max: 10 },
      ...overrideConfig,
    });
  }
  return db;
}

/**
 * Set the shared Knex instance (primarily for tests).
 *
 * @param {import('knex').Knex|null} instance
 */
function setDb(instance) {
  db = instance;
}

/**
 * Close and destroy the database connection pool.
 */
async function closeDb() {
  if (db) {
    await db.destroy();
    db = null;
  }
}

/**
 * Convenience wrapper for `withTransaction(getDb(), callback, options)`
 *
 * @param {Function} callback - Async function receiving (trx)
 * @param {Object} [options]
 * @returns {Promise<*>}
 */
async function transaction(callback, options = {}) {
  const currentDb = getDb();
  return withTransaction(currentDb, callback, options);
}

module.exports = {
  getDb,
  setDb,
  closeDb,
  withTransaction,
  transaction,
  sortIds,
  lockRows,
  isDeadlockOrSerializationError,
};
