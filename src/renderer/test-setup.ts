import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: TestResizeObserver });

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'mineprompt');
  vi.restoreAllMocks();
});
