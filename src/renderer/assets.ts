import * as textureModule from '../js/item-texture-map.js';
import * as resolverModule from '../js/item-texture-resolver.js';
import { reportRendererIssue } from './debug';

type ResolverApi = { ItemTextureResolver: new (map?: Record<string, string>) => { configure(image: HTMLImageElement, name: string): void } };
const importedTextures = textureModule as unknown as Record<string, string> & { default?: Record<string, string> };
const directTextures = Object.keys(importedTextures).some((key) => key !== 'default') ? importedTextures : undefined;
const browserTextures = (globalThis as typeof globalThis & { minepromptItemTextures?: Record<string, string> }).minepromptItemTextures;
const textureMap = importedTextures.default || directTextures || browserTextures;
if (!textureMap) throw new Error('The item texture map could not be loaded.');
const importedModule = resolverModule as unknown as Partial<ResolverApi> & { default?: ResolverApi };
const importedApi = importedModule.default || (importedModule.ItemTextureResolver ? importedModule as ResolverApi : undefined);
const browserApi = (globalThis as typeof globalThis & { minepromptItemTextureResolver?: ResolverApi }).minepromptItemTextureResolver;
const resolverApi = importedApi || browserApi;
if (!resolverApi) throw new Error('The item texture resolver could not be loaded.');
const { ItemTextureResolver } = resolverApi;
const textureResolver = new ItemTextureResolver(textureMap);

export function configureItemTexture(image: HTMLImageElement | null, name: string): void {
  if (image) textureResolver.configure(image, name);
}

export function effectAssetName(value: string): string {
  const normalized = String(value || '')
    .replace(/^minecraft:/u, '')
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/[^A-Za-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .toLowerCase();
  return normalized === 'bad_luck' ? 'unluck' : normalized;
}

export function configureEffectTexture(image: HTMLImageElement | null, effect: string): void {
  if (!image) return;
  const normalized = effectAssetName(effect);
  const source = `img/faithful/effects/${normalized}.png`;
  if (image.dataset.effectSource === source) return;
  image.dataset.effectSource = source;
  image.hidden = false;
  image.onerror = () => {
    image.hidden = true;
    reportRendererIssue('Assets', 'Potion effect texture failed to load.', { effect, normalized, source });
  };
  image.onload = () => { image.hidden = false; };
  image.src = source;
}

export function playerHead(username: string | null | undefined, enabled: boolean): string {
  return username && enabled
    ? `https://mc-heads.net/head/${encodeURIComponent(username)}/nohelm`
    : 'img/heads/wood_question.png';
}
