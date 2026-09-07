'use strict';

function printable(value) {
  return String(value ?? '').replace(/[\r\n]+/gu, ' ');
}

function truncate(value, width) {
  const text = printable(value);
  if (text.length <= width) return text;
  if (width <= 3) return '.'.repeat(width);
  return `${text.slice(0, width - 3)}...`;
}

function createTextTable(rows, columns = Object.keys(rows[0] || {}), maximumWidth = 36) {
  if (!rows.length || !columns.length) return '';
  const widths = columns.map((column) => Math.min(maximumWidth, Math.max(
    printable(column).length,
    ...rows.map((row) => printable(row[column]).length)
  )));
  const render = (row) => columns.map((column, index) => truncate(row[column], widths[index]).padEnd(widths[index])).join('  ');
  const header = render(Object.fromEntries(columns.map((column) => [column, column])));
  return [header, widths.map((width) => '-'.repeat(width)).join('  '), ...rows.map(render)].join('\n');
}

module.exports = { createTextTable };
