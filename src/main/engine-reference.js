'use strict';

function parsePullReference(value) {
  const input = String(value || '').trim();
  const url = input.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/iu);
  const shorthand = input.match(/^([^/#\s]+)\/([^#\s]+)#(\d+)$/u);
  const match = url || shorthand;
  if (!match) throw new Error(`Invalid GitHub pull request reference: ${input || 'empty value'}.`);
  const number = Number(match[3]);
  if (!Number.isInteger(number) || number < 1) throw new Error(`Invalid GitHub pull request number: ${match[3]}.`);
  return { owner: match[1], repository: match[2].replace(/\.git$/iu, ''), number };
}

function pullReference(value) {
  const parsed = typeof value === 'string' ? parsePullReference(value) : value;
  return `${parsed.owner}/${parsed.repository}#${parsed.number}`;
}

function profileId(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
  if (!normalized || normalized.length > 64) throw new Error('Engine profile names must contain 1 to 64 letters, numbers, spaces, or separators.');
  return normalized;
}

module.exports = { parsePullReference, profileId, pullReference };
