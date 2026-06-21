// Aplica schema.sql contra la base de datos configurada en .env
// Uso: npm run init-db
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function main() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  try {
    await pool.query(sql);
    console.log('✔ Esquema aplicado correctamente.');
  } catch (err) {
    console.error('✘ Error aplicando el esquema:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
