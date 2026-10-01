'use strict';

function plainText(value, depth = 0) {
  if (value === null || value === undefined || depth > 8) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length < 16384) {
      try { return plainText(JSON.parse(trimmed), depth + 1); } catch {}
    }
    return value.replace(/\u00a7[0-9a-fk-or]/giu, '');
  }
  if (Array.isArray(value)) return value.map((entry) => plainText(entry, depth + 1)).filter(Boolean).join('');
  if (typeof value !== 'object') return '';
  if (value.value !== undefined && Object.keys(value).every((key) => ['type', 'value'].includes(key))) return plainText(value.value, depth + 1);
  const parts = [];
  if (typeof value.text === 'string') parts.push(value.text);
  if (typeof value.translate === 'string' && !value.text) parts.push(value.translate);
  if (value.with) parts.push(plainText(value.with, depth + 1));
  if (value.extra) parts.push(plainText(value.extra, depth + 1));
  if (parts.length) return parts.join('');
  if (value.constructor && value.constructor !== Object && typeof value.toString === 'function') {
    const rendered = value.toString();
    if (rendered && rendered !== '[object Object]') return plainText(rendered, depth + 1);
  }
  return '';
}

module.exports = { plainText };
