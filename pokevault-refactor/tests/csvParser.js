'use strict';
// Replicates the CSV parsing logic from app.js for use in Node.js tests.
// Handles quoted fields (Pokégenie export has quoted strings with commas).

const fs = require('fs');

function parseLine(line) {
  const fields = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

function loadCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return parseCSV(text);
}

module.exports = { parseLine, parseCSV, loadCSV };
