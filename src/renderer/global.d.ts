import type { MinePromptApi } from './types';

declare global {
  interface Window {
    mineprompt: MinePromptApi;
  }
}

declare module '../js/item-texture-map.js' {
  const map: Record<string, string>;
  export default map;
}

declare module '../js/item-texture-resolver.js' {
  export class ItemTextureResolver {
    constructor(map?: Record<string, string>);
    configure(image: HTMLImageElement, name: string): void;
  }
}

export {};
