module.exports = async function extractZip(source, options) {
  const module = await import('@electron-internal/extract-zip');
  return module.default(source, options);
};
