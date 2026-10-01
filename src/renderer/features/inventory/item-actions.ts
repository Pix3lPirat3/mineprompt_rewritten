import type { InventoryRequest, ItemStack } from '../../types';
import type { SlotAddress } from './InventorySlot';

export interface ItemActionDefinition {
  id: string;
  label: string;
  detail: string;
  group: 'inspect' | 'transfer' | 'use' | 'swing' | 'equip' | 'danger';
  danger?: boolean;
  request: Pick<InventoryRequest, 'scope' | 'action'> & Record<string, unknown>;
}

interface ItemActionContext {
  containerOpen: boolean;
  containerTitle?: string | null;
}

function equipmentDestination(item: ItemStack): 'head' | 'torso' | 'legs' | 'feet' | null {
  if (item.name.endsWith('_helmet') || ['carved_pumpkin', 'player_head'].includes(item.name)) return 'head';
  if (item.name.endsWith('_chestplate') || item.name === 'elytra') return 'torso';
  if (item.name.endsWith('_leggings')) return 'legs';
  if (item.name.endsWith('_boots')) return 'feet';
  return null;
}

export function itemActions(item: ItemStack, address: SlotAddress, context: ItemActionContext): ItemActionDefinition[] {
  const slot = address.slot;
  const scope = address.scope;
  const actions: ItemActionDefinition[] = [{
    id: 'inspect',
    label: 'View item details',
    detail: `${scope} inspect ${slot}`,
    group: 'inspect',
    request: { scope, action: 'inspect', target: String(slot) }
  }];

  if (context.containerOpen) {
    const destination = scope === 'container' ? 'player inventory' : context.containerTitle || 'open container';
    for (const quantity of ['one', 'half', 'stack'] as const) {
      actions.push({
        id: `transfer-${quantity}`,
        label: `Move ${quantity === 'stack' ? 'stack' : quantity} to ${destination}`,
        detail: `container transfer ${scope} ${slot} ${quantity}`,
        group: 'transfer',
        request: { scope: 'container', action: 'transfer', sourceScope: scope, target: String(slot), quantity }
      });
    }
    return actions;
  }

  if (scope !== 'inventory') return actions;
  actions.push(
    { id: 'use-main', label: 'Use item from main hand', detail: `inventory use ${slot} mainhand | bot.activateItem(false)`, group: 'use', request: { scope, action: 'use', target: String(slot), hand: 'mainhand' } },
    { id: 'use-off', label: 'Use item from off hand', detail: `inventory use ${slot} offhand | bot.activateItem(true)`, group: 'use', request: { scope, action: 'use', target: String(slot), hand: 'offhand' } },
    { id: 'swing-right', label: 'Swing item in main hand', detail: `inventory swing ${slot} right | bot.swingArm('right', true)`, group: 'swing', request: { scope, action: 'swing', target: String(slot), arm: 'right' } },
    { id: 'swing-left', label: 'Swing item in off hand', detail: `inventory swing ${slot} left | bot.swingArm('left', true)`, group: 'swing', request: { scope, action: 'swing', target: String(slot), arm: 'left' } },
    { id: 'equip-main', label: 'Equip to main hand', detail: `inventory equip ${slot} hand | bot.equip`, group: 'equip', request: { scope, action: 'equip', target: String(slot), destination: 'hand' } },
    { id: 'equip-off', label: 'Equip to off hand', detail: `inventory equip ${slot} off-hand | bot.equip`, group: 'equip', request: { scope, action: 'equip', target: String(slot), destination: 'off-hand' } }
  );
  const destination = equipmentDestination(item);
  if (destination) {
    actions.push({
      id: `equip-${destination}`,
      label: `Equip to ${destination}`,
      detail: `inventory equip ${slot} ${destination} | bot.equip`,
      group: 'equip',
      request: { scope, action: 'equip', target: String(slot), destination }
    });
  }
  if (Number.isInteger(item.hotbarIndex)) {
    const hotbarIndex = Number(item.hotbarIndex);
    actions.push({
      id: 'select',
      label: `Select hotbar slot ${hotbarIndex + 1}`,
      detail: `inventory select ${hotbarIndex} | bot.setQuickBarSlot`,
      group: 'equip',
      request: { scope, action: 'select', target: String(hotbarIndex) }
    });
  }
  actions.push(
    { id: 'drop-one', label: 'Drop one item', detail: `inventory drop ${slot} one`, group: 'danger', danger: true, request: { scope, action: 'drop', target: String(slot), quantity: 'one' } },
    { id: 'drop-stack', label: 'Drop entire stack', detail: `inventory drop ${slot} stack`, group: 'danger', danger: true, request: { scope, action: 'drop', target: String(slot), quantity: 'stack' } }
  );
  return actions;
}
