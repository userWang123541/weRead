const fs = require('fs');
const path = require('path');

const TAXONOMY_PATH = path.join(__dirname, '..', 'config', 'taxonomy.json');

function loadTaxonomy() {
  const raw = fs.readFileSync(TAXONOMY_PATH, 'utf-8');
  return JSON.parse(raw);
}

module.exports = { loadTaxonomy };
