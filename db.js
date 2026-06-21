// db.js – PostgreSQL helper functions

const { Pool } = require('pg');

// Load connection config from environment variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // You can add additional config like ssl if needed
});
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = {
  /**
   * Execute a query with parameters.
   * @param {string} text SQL query text
   * @param {Array} params Query parameters
   * @returns {Promise} Resolves with rows
   */
  query: (text, params = []) => {
    return pool.query(text, params);
  },

  /**
   * Insert or update a collection item.
   * For simplicity, we use INSERT ... ON CONFLICT for id primary key.
   */
  upsert: (table, item, idField = 'id') => {
    const columns = Object.keys(item);
    const values = Object.values(item);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const updates = columns.map((col, i) => `${col}=EXCLUDED.${col}`).join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (${idField}) DO UPDATE SET ${updates}`;
    return pool.query(sql, values);
  },

  /**
   * Delete a row from a table by id.
   */
  deleteById: (table, id, idField = 'id') => {
    const sql = `DELETE FROM ${table} WHERE ${idField} = $1`;
    return pool.query(sql, [id]);
  }
};
