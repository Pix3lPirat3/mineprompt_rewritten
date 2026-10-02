import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { useEffect, useState, type MouseEvent } from 'react';
import { shallowEqual } from 'react-redux';
import { playerHead } from '../../assets';
import { ContextMenu, type MenuEntry } from '../../components/ContextMenu';
import { consoleActions, useAppDispatch, useAppSelector } from '../../store';
import type { InventoryEvent, InventoryEventPayload, InventoryRequest, ItemStack } from '../../types';
import { FittedInventoryStage } from './FittedInventoryStage';
import { EffectPanel } from './EffectPanel';
import { ItemIcon } from './ItemIcon';
import { itemActions } from './item-actions';
import { InventorySlot, type SlotAddress } from './InventorySlot';
import { PlayerHud } from './PlayerHud';
import { WorkstationControls } from './WorkstationControls';

interface ItemMenu {
  address: SlotAddress;
  item: ItemStack;
  x: number;
  y: number;
}

function eventDescription(event: InventoryEvent): string {
  const descriptions: Record<string, string> = {
    open: 'Container opened',
    close: 'Container closed',
    update: 'Inventory updated',
    property: 'Container progress updated',
    selection: Number.isInteger(event.slot) ? `Hotbar slot ${Number(event.slot) + 1} selected` : 'Hotbar selection changed'
  };
  return descriptions[event.type] || 'Inventory synchronized';
}

export function InventoryWorkspace() {
  const dispatch = useAppDispatch();
  const runtime = useAppSelector((state) => ({
    selectedSessionId: state.runtime.selectedSessionId,
    displayName: state.runtime.state.displayName,
    username: state.runtime.state.username,
    sessionUsername: state.runtime.session.username,
    externalPlayerHeadsEnabled: state.runtime.preferences.externalPlayerHeadsEnabled,
    connectionId: state.runtime.session.connectionId,
    inventoryRevision: state.runtime.session.inventoryRevision,
    windowId: state.runtime.session.windowId,
    containerOpen: state.runtime.session.containerOpen,
    inventorySlots: state.runtime.session.inventorySlots,
    inventoryLayout: state.runtime.session.inventoryLayout,
    containerSlots: state.runtime.session.containerSlots,
    containerLayout: state.runtime.session.containerLayout,
    usingItem: state.runtime.session.presentation.hud.usingItem
  }), shallowEqual);
  const activity = useAppSelector((state) => state.ui.inventoryActivity);
  const [menu, setMenu] = useState<ItemMenu | null>(null);
  const [toast, setToast] = useState<InventoryEventPayload | null>(null);
  const inventorySlots = runtime.inventorySlots;
  const container = runtime.containerLayout;

  useEffect(() => {
    if (!activity || activity.sessionId !== runtime.selectedSessionId) {
      setToast(null);
      return;
    }
    setToast(activity);
    const timer = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timer);
  }, [activity, runtime.selectedSessionId]);

  const request = async (details: Pick<InventoryRequest, 'scope' | 'action'> & Record<string, unknown>) => {
    try {
      await window.mineprompt.inventoryAction({
        sessionId: runtime.selectedSessionId,
        connectionId: runtime.connectionId,
        windowId: runtime.windowId,
        expectedRevision: runtime.inventoryRevision,
        ...details
      });
    } catch (error) {
      dispatch(consoleActions.entryReceived({
        level: 'error',
        message: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        sessionId: runtime.selectedSessionId
      }));
    }
  };

  const clickSlot = (event: MouseEvent<HTMLButtonElement>, address: SlotAddress, item: ItemStack | null) => {
    if (!item) return;
    if (runtime.containerOpen && event.shiftKey) {
      void request({ scope: 'container', action: 'transfer', sourceScope: address.scope, target: String(address.slot), quantity: 'stack' });
      return;
    }
    void request({ scope: address.scope, action: 'inspect', target: String(address.slot) });
  };

  const itemMenu: MenuEntry[] = (() => {
    if (!menu) return [];
    return itemActions(menu.item, menu.address, {
      containerOpen: runtime.containerOpen,
      containerTitle: runtime.containerLayout?.title
    }).map((action) => ({ ...action, run: () => request(action.request) }));
  })();

  const slot = (scope: 'inventory' | 'container', index: number, item: ItemStack | null, role?: string, selected?: boolean) => (
    <InventorySlot
      key={`${scope}:${index}`}
      scope={scope}
      slot={index}
      item={item}
      role={role}
      selected={selected}
      using={Boolean(selected && runtime.usingItem)}
      onClick={clickSlot}
      onMenu={(event, address, stack) => {
        setMenu({ address, item: stack, x: event.clientX, y: event.clientY });
      }}
    />
  );

  return (
    <DragDropProvider onDragEnd={(event) => {
      if (event.canceled) return;
      const source = event.operation.source?.data as { scope?: 'inventory' | 'container'; slot?: number } | undefined;
      const target = event.operation.target?.data as { scope?: 'inventory' | 'container'; slot?: number } | undefined;
      if (!source?.scope || !target?.scope || !Number.isInteger(source.slot) || !Number.isInteger(target.slot)) return;
      void request({
        scope: 'container',
        action: 'move',
        fromScope: source.scope,
        fromSlot: source.slot,
        toScope: target.scope,
        toSlot: target.slot
      });
    }}>
      <section className="inventory-workspace">
        {toast ? <div className="inventory-toast" role="status">{eventDescription(toast.event)}</div> : null}
        <FittedInventoryStage split={Boolean(container)}>
          <div className="player-inventory-cluster">
            <div className="player-inventory-stack">
              <section className="player-inventory">
                <div className="player-inventory__upper">
                  <div className="equipment-column">
                    {[5, 6, 7, 8].map((index) => slot('inventory', index, inventorySlots[index] || null, ['head', 'torso', 'legs', 'feet'][index - 5]))}
                  </div>
                  <div className="player-model">
                    <img src={playerHead(runtime.sessionUsername, runtime.externalPlayerHeadsEnabled)} alt="" />
                    <strong>{runtime.displayName || runtime.username || 'Not connected'}</strong>
                  </div>
                  <div className="crafting-grid">
                    <span className="crafting-grid__label">Crafting</span>
                    <div>{[1, 2, 3, 4].map((index) => slot('inventory', index, inventorySlots[index] || null, 'crafting input'))}</div>
                    <span className="crafting-grid__result">{slot('inventory', 0, inventorySlots[0] || null, 'crafting result')}</span>
                  </div>
                  <div className="offhand-slot">{slot('inventory', 45, inventorySlots[45] || null, 'off hand')}</div>
                </div>
                <div className="main-inventory-grid">
                  {Array.from({ length: 27 }, (_, offset) => {
                    const index = offset + 9;
                    return slot('inventory', index, inventorySlots[index] || null);
                  })}
                </div>
                <div className="hotbar-grid">
                  {Array.from({ length: 9 }, (_, offset) => {
                    const index = offset + 36;
                    return slot('inventory', index, inventorySlots[index] || null, 'hotbar', runtime.inventoryLayout?.selectedHotbar === offset);
                  })}
                </div>
              </section>
              <PlayerHud />
            </div>
            <EffectPanel />
          </div>
          {container ? (
            <section className="container-window" data-kind={container.kind}>
              <div className="container-window__meta">
                <strong>{container.title}</strong>
                <button type="button" onClick={() => void request({ scope: 'container', action: 'close' })}>Close</button>
              </div>
              <div className="container-grid" style={{ '--columns': container.columns } as React.CSSProperties}>
                {Array.from({ length: container.slotCount }, (_, index) => slot('container', index, runtime.containerSlots[index] || null, container.slotRoles[index]))}
              </div>
              {Object.keys(container.properties).length ? (
                <div className="container-properties">
                  {Object.entries(container.properties).map(([name, value]) => <span key={name}><small>{name}</small><strong>{value}</strong></span>)}
                </div>
              ) : null}
              <WorkstationControls layout={container} request={request} />
            </section>
          ) : null}
        </FittedInventoryStage>
      </section>
      <DragOverlay dropAnimation={null} className="inventory-drag-overlay">
        {(source) => {
          const item = (source.data as { item?: ItemStack }).item;
          return item ? <ItemIcon item={item} preview /> : null;
        }}
      </DragOverlay>
      {menu ? <ContextMenu x={menu.x} y={menu.y} title={menu.item.displayName} subtitle={`${menu.address.scope === 'container' ? runtime.containerLayout?.title || 'Container' : 'Player inventory'} slot ${menu.address.slot}`} entries={itemMenu} close={() => setMenu(null)} /> : null}
    </DragDropProvider>
  );
}
