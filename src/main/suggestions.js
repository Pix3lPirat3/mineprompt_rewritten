'use strict';

const { levenshtein } = require('./command-registry');

function closestMatches(target, values, maximum = 3) {
  const unique = [...new Set(values.map(String))];
  return unique
    .map((value) => ({ value, distance: levenshtein(String(target).toLowerCase(), value.toLowerCase()) }))
    .sort((a, b) => a.distance - b.distance || a.value.localeCompare(b.value))
    .slice(0, maximum)
    .map((entry) => entry.value);
}

module.exports = { closestMatches };
