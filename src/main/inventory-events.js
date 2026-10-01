'use strict';

const { performance } = require('node:perf_hooks');
const { describeWindow, serializeItem, windowPropertyName } = require('./inventory-model');

class InventoryEventStream {
  constructor(publish = () => {}, getChatMessage = () => null, getRegistry = () => null) {
    this.publish = publish;
    this.getChatMessage = getChatMessage;
    this.getRegistry = getRegistry;
    this.revision = 0;
    this.listeners = new Map();
  }

  emit(type, scope, details = {}) {
    this.revision += 1;
    this.publish({
      revision: this.revision,
      timestamp: Date.now(),
      type,
      scope,
      ...details
    });
  }

  watch(window, scope) {
    if (!window?.on || this.listeners.has(window)) return;
    const listener = (slot, previous, current) => {
      const startedAt = performance.now();
      const ChatMessage = this.getChatMessage();
      const registry = this.getRegistry();
      const inventorySlot = scope === 'container' && slot >= window.inventoryStart
        ? slot - window.inventoryStart + 9
        : slot;
      const eventScope = scope === 'container' && slot >= window.inventoryStart ? 'inventory' : scope;
      const previousItem = previous ? serializeItem(previous, window.hotbarStart, window.inventoryEnd, ChatMessage, registry) : null;
      const currentItem = current ? serializeItem(current, window.hotbarStart, window.inventoryEnd, ChatMessage, registry) : null;
      this.emit('update', eventScope, {
      windowId: window.id ?? null,
        slot: Number(inventorySlot),
        previous: previousItem ? { ...previousItem, slot: Number(inventorySlot) } : null,
        current: currentItem ? { ...currentItem, slot: Number(inventorySlot) } : null,
        processing: { itemSerializationMs: performance.now() - startedAt }
      });
    };
    this.listeners.set(window, listener);
    window.on('updateSlot', listener);
  }

  unwatch(window) {
    const listener = this.listeners.get(window);
    if (!listener) return;
    window.off?.('updateSlot', listener);
    window.removeListener?.('updateSlot', listener);
    this.listeners.delete(window);
  }

  open(window, title) {
    this.watch(window, 'container');
    this.emit('open', 'container', { window: describeWindow(window, title, this.getChatMessage(), this.getRegistry()), windowId: window?.id ?? null });
  }

  close(window, title) {
    const description = describeWindow(window, title, this.getChatMessage(), this.getRegistry());
    this.unwatch(window);
    this.emit('close', 'container', { window: description, windowId: window?.id ?? null });
  }

  select(index) {
    this.emit('selection', 'inventory', { slot: Number(index) });
  }

  property(window, property, value) {
    this.emit('property', 'container', {
      windowId: window?.id ?? null,
      property: Number(property),
      propertyName: windowPropertyName(window, property),
      value: Number(value)
    });
  }

  reset() {
    for (const [window, listener] of this.listeners) {
      window.off?.('updateSlot', listener);
      window.removeListener?.('updateSlot', listener);
    }
    this.listeners.clear();
    this.revision = 0;
  }
}

module.exports = { InventoryEventStream };
