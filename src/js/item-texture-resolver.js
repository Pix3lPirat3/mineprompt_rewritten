'use strict';

class ItemTextureResolver {
  constructor(textureMap = globalThis.minepromptItemTextures || {}) {
    this.textureMap = textureMap;
    this.cache = new Map();
  }

  assetPath(category, file) {
    return `img/${category}/${file}`;
  }

  candidates(name) {
    const safeName = String(name || 'barrier').toLowerCase().replace(/[^a-z0-9_]/gu, '');
    const aliases = { clock: 'clock_00', compass: 'compass_16', crossbow: 'crossbow_standby', recovery_compass: 'recovery_compass_16' };
    const itemName = aliases[safeName] || safeName;
    const mapped = this.textureMap[safeName];
    const candidates = [
      mapped ? { source: `img/${mapped}.png`, block: mapped.includes('/blocks/') } : null,
      { source: this.assetPath('faithful/items', `${itemName}.png`), block: false },
      { source: this.assetPath('faithful/blocks', `${safeName}.png`), block: true },
      { source: this.assetPath('faithful/blocks', `${safeName}_front.png`), block: true },
      { source: this.assetPath('faithful/blocks', `${safeName}_side.png`), block: true },
      { source: this.assetPath('faithful/blocks', `${safeName}_top.png`), block: true },
      { source: this.assetPath('faithful/items', 'barrier.png'), block: false }
    ].filter(Boolean);
    return {
      safeName,
      candidates: candidates.filter((candidate, index, values) => values.findIndex((entry) => entry.source === candidate.source) === index)
    };
  }

  renderBlock(image, source) {
    const cached = this.cache.get(source);
    if (cached) {
      image.dataset.renderedBlock = 'true';
      image.src = cached;
      return;
    }
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) return;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.setTransform(14 / width, 7 / width, -14 / height, 7 / height, 16, 1);
    context.drawImage(image, 0, 0);
    context.setTransform(14 / width, 7 / width, 0, 16 / height, 2, 8);
    context.drawImage(image, 0, 0);
    context.setTransform(14 / width, -7 / width, 0, 16 / height, 16, 15);
    context.drawImage(image, 0, 0);
    context.resetTransform();
    context.fillStyle = 'rgba(0, 0, 0, 0.12)';
    context.beginPath();
    context.moveTo(2, 8);
    context.lineTo(16, 15);
    context.lineTo(16, 31);
    context.lineTo(2, 24);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(0, 0, 0, 0.28)';
    context.beginPath();
    context.moveTo(16, 15);
    context.lineTo(30, 8);
    context.lineTo(30, 24);
    context.lineTo(16, 31);
    context.closePath();
    context.fill();
    image.dataset.renderedBlock = 'true';
    const rendered = canvas.toDataURL('image/png');
    this.cache.set(source, rendered);
    image.src = rendered;
  }

  renderShield(image, source) {
    const cacheKey = `shield:${source}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      image.dataset.renderedBlock = 'true';
      image.src = cached;
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.beginPath();
    context.moveTo(4, 3);
    context.lineTo(28, 3);
    context.lineTo(27, 19);
    context.lineTo(23, 25);
    context.lineTo(16, 30);
    context.lineTo(9, 25);
    context.lineTo(5, 19);
    context.closePath();
    context.save();
    context.clip();
    context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 4, 3, 24, 27);
    context.fillStyle = 'rgba(0, 0, 0, 0.12)';
    context.fillRect(16, 3, 12, 27);
    context.restore();
    context.strokeStyle = '#d2d5d7';
    context.lineWidth = 2;
    context.stroke();
    image.dataset.renderedBlock = 'true';
    const rendered = canvas.toDataURL('image/png');
    this.cache.set(cacheKey, rendered);
    image.src = rendered;
  }

  configure(image, name) {
    const { safeName, candidates } = this.candidates(name);
    let index = 0;
    image.src = candidates[index].source;
    image.addEventListener('error', () => {
      index += 1;
      if (index < candidates.length) image.src = candidates[index].source;
    });
    image.addEventListener('load', () => {
      if (!candidates[index]?.block || image.dataset.renderedBlock === 'true') return;
      if (safeName === 'shield') this.renderShield(image, candidates[index].source);
      else this.renderBlock(image, candidates[index].source);
    });
  }
}

const itemTextureResolverApi = Object.freeze({ ItemTextureResolver });

if (typeof module === 'object' && module.exports) {
  module.exports = itemTextureResolverApi;
} else {
  Object.defineProperty(globalThis, 'minepromptItemTextureResolver', { value: itemTextureResolverApi });
}
