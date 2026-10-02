import { useEffect, useState } from 'react';
import { configureItemTexture } from '../../assets';
import { Modal } from '../../components/Modal';
import { consoleActions, useAppDispatch, useAppSelector } from '../../store';
import type { ItemStack, StorageIndexedItem, StorageOperationStatus, StorageScanDetails, StorageZoneSummary } from '../../types';

type Inspection = { zone: StorageZoneSummary; scan: StorageScanDetails | null };

function scanLabel(zone: StorageZoneSummary) {
  const scan = zone.scan;
  if (!scan) return 'Not scanned';
  if (scan.running) return `${scan.containersScanned}/${scan.containersFound} containers`;
  return `${scan.itemCount} items, ${scan.containersScanned} containers${scan.stale ? ', stale' : ''}`;
}

function operationLabel(operation: StorageOperationStatus) {
  if (operation.kind === 'audit') return {
    title: operation.running ? 'Auditing' : operation.phase,
    detail: `${operation.containersVisited}/${operation.containersPlanned} containers, ${operation.errorCount} errors, ${operation.warningCount} warnings`
  };
  return {
    title: operation.running ? operation.kind === 'deposit' ? 'Depositing' : 'Fetching' : operation.phase,
    detail: `${operation.transferred}/${operation.requested} ${operation.displayName}`
  };
}

export function StorageRibbon() {
  const dispatch = useAppDispatch();
  const sessionId = useAppSelector((state) => state.runtime.selectedSessionId);
  const status = useAppSelector((state) => state.runtime.state.status);
  const storage = useAppSelector((state) => state.runtime.session.storage);
  const inventory = useAppSelector((state) => state.runtime.session.inventory);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StorageIndexedItem | null>(null);
  const [fetchCount, setFetchCount] = useState(1);
  const [selectedDeposit, setSelectedDeposit] = useState<ItemStack | null>(null);
  const [depositCount, setDepositCount] = useState(1);
  const [planText, setPlanText] = useState('');

  useEffect(() => {
    setInspection(null);
    setSelectedItem(null);
    setSelectedDeposit(null);
    setPlanText('');
  }, [sessionId]);

  const report = (error: unknown) => dispatch(consoleActions.entryReceived({
    level: 'error',
    message: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
    sessionId
  }));

  const inspect = async (zone: StorageZoneSummary) => {
    setLoading(true);
    try {
      const result = await window.mineprompt.storageAction({ sessionId, action: 'inspect', zone: zone.id }) as unknown as Inspection;
      setInspection(result);
    } catch (error) {
      report(error);
    } finally {
      setLoading(false);
    }
  };

  const scan = async (zone: StorageZoneSummary) => {
    try {
      await window.mineprompt.storageAction({ sessionId, action: 'scan', zone: zone.id });
    } catch (error) {
      report(error);
    }
  };

  const audit = async (zone: StorageZoneSummary) => {
    try {
      const result = await window.mineprompt.storageAction({ sessionId, action: 'audit', zone: zone.id }) as { status?: { containersPlanned: number } };
      if (result.status) setPlanText(`Audit started across ${result.status.containersPlanned} container${result.status.containersPlanned === 1 ? '' : 's'}`);
    } catch (error) {
      report(error);
    }
  };

  const fetch = async (execute: boolean) => {
    if (!inspection || !selectedItem) return;
    setLoading(true);
    setPlanText('');
    try {
      const result = await window.mineprompt.storageAction({
        sessionId,
        action: execute ? 'fetch' : 'plan',
        zone: inspection.zone.id,
        item: selectedItem.variantId,
        count: fetchCount
      }) as { plan?: { allocations: unknown[]; estimatedCost: number }; status?: { containersPlanned: number } };
      if (result.plan) setPlanText(`${fetchCount} items from ${result.plan.allocations.length} container${result.plan.allocations.length === 1 ? '' : 's'}, route cost ${result.plan.estimatedCost.toFixed(1)}`);
      else if (result.status) setPlanText(`Fetch started across ${result.status.containersPlanned} container${result.status.containersPlanned === 1 ? '' : 's'}`);
    } catch (error) {
      report(error);
    } finally {
      setLoading(false);
    }
  };

  const deposit = async (execute: boolean) => {
    if (!inspection || !selectedDeposit) return;
    setLoading(true);
    setPlanText('');
    try {
      const result = await window.mineprompt.storageAction({
        sessionId,
        action: execute ? 'deposit' : 'plan-deposit',
        zone: inspection.zone.id,
        slot: selectedDeposit.slot,
        count: depositCount
      }) as { plan?: { allocations: unknown[]; estimatedCost: number }; status?: { containersPlanned: number } };
      if (result.plan) setPlanText(`${depositCount} items into ${result.plan.allocations.length} container${result.plan.allocations.length === 1 ? '' : 's'}, route cost ${result.plan.estimatedCost.toFixed(1)}`);
      else if (result.status) setPlanText(`Deposit started across ${result.status.containersPlanned} container${result.status.containersPlanned === 1 ? '' : 's'}`);
    } catch (error) {
      report(error);
    } finally {
      setLoading(false);
    }
  };

  if (!storage?.zones.length) return null;

  return (
    <section className="storage-ribbon" aria-label="Storage zones">
      <div className="storage-ribbon__label"><strong>Storage</strong><small>{storage.zones.length}</small></div>
      <div className="storage-ribbon__list">
        {storage.operation ? (
          <div className="storage-chip storage-chip--operation">
            <span><strong>{operationLabel(storage.operation).title}</strong><small>{operationLabel(storage.operation).detail}</small></span>
          </div>
        ) : null}
        {storage.zones.map((zone) => (
          <button type="button" className="storage-chip" data-stale={zone.scan?.stale || undefined} key={zone.id} onClick={() => void inspect(zone)}>
            <span><strong>{zone.name}</strong><small>{scanLabel(zone)}</small></span>
          </button>
        ))}
      </div>
      {inspection ? (
        <Modal title={inspection.zone.name} eyebrow="Storage index" close={() => setInspection(null)}>
          <div className="storage-inspection">
            <header>
              <span>{inspection.scan ? `${inspection.scan.containersScanned}/${inspection.scan.containersFound} containers${inspection.scan.stale ? ', stale' : ''}` : 'Not scanned'}</span>
              <span>
                <button type="button" onClick={() => void inspect(inspection.zone)} disabled={loading}>Refresh</button>
                <button type="button" onClick={() => void scan(inspection.zone)} disabled={status !== 'online' || inspection.scan?.running}>Scan</button>
                <button type="button" onClick={() => void audit(inspection.zone)} disabled={status !== 'online' || !inspection.scan?.complete || storage.operation?.running}>Audit</button>
              </span>
            </header>
            {inspection.scan?.items.length ? (
              <div className="storage-item-grid">
                {inspection.scan.items.map((item) => (
                  <button type="button" className={selectedItem?.variantId === item.variantId ? 'selected' : ''} key={item.variantId} title={`${item.displayName}\nVariant ${item.variantId}${item.lore.length ? `\n${item.lore.join('\n')}` : ''}`} onClick={() => {
                    setSelectedItem(item);
                    setFetchCount(Math.min(item.count, Math.max(1, fetchCount)));
                    setPlanText('');
                  }}>
                    <img ref={(image) => configureItemTexture(image, item.name)} alt="" />
                    <span><strong>{item.displayName}</strong><small>{item.count} total</small></span>
                  </button>
                ))}
              </div>
            ) : <p className="storage-empty">{inspection.scan ? 'No items were indexed.' : 'Scan this zone to build its item index.'}</p>}
            {selectedItem ? (
              <div className="storage-fetch-controls">
                <span><strong>{selectedItem.displayName}</strong><small>Variant {selectedItem.variantId}</small></span>
                <input aria-label="Fetch count" type="number" min="1" max={selectedItem.count} value={fetchCount || ''} onChange={(event) => setFetchCount(Math.max(0, Math.min(selectedItem.count, Number(event.target.value) || 0)))} />
                <button type="button" disabled={loading || fetchCount < 1 || inspection.scan?.stale} onClick={() => void fetch(false)}>Plan fetch</button>
                <button className="primary" type="button" disabled={loading || fetchCount < 1 || status !== 'online' || inspection.scan?.stale || storage.operation?.running} onClick={() => void fetch(true)}>Fetch</button>
                {planText ? <small>{planText}</small> : null}
              </div>
            ) : null}
            {inventory.length ? (
              <section className="storage-deposit">
                <header><strong>Deposit from inventory</strong><small>{inventory.reduce((sum, item) => sum + item.count, 0)} items</small></header>
                <div className="storage-item-grid">
                  {inventory.map((item) => (
                    <button type="button" className={selectedDeposit?.slot === item.slot ? 'selected' : ''} key={item.slot} title={`${item.displayName}\nSlot ${item.slot}`} onClick={() => {
                      setSelectedDeposit(item);
                      setDepositCount(Math.min(item.count, Math.max(1, depositCount)));
                      setPlanText('');
                    }}>
                      <img ref={(image) => configureItemTexture(image, item.name)} alt="" />
                      <span><strong>{item.displayName}</strong><small>{item.count} in slot {item.slot}</small></span>
                    </button>
                  ))}
                </div>
                {selectedDeposit ? (
                  <div className="storage-fetch-controls">
                    <span><strong>{selectedDeposit.displayName}</strong><small>Inventory slot {selectedDeposit.slot}</small></span>
                    <input aria-label="Deposit count" type="number" min="1" max={selectedDeposit.count} value={depositCount || ''} onChange={(event) => setDepositCount(Math.max(0, Math.min(selectedDeposit.count, Number(event.target.value) || 0)))} />
                    <button type="button" disabled={loading || depositCount < 1 || inspection.scan?.stale} onClick={() => void deposit(false)}>Plan deposit</button>
                    <button className="primary" type="button" disabled={loading || depositCount < 1 || status !== 'online' || inspection.scan?.stale || storage.operation?.running} onClick={() => void deposit(true)}>Deposit</button>
                  </div>
                ) : null}
              </section>
            ) : null}
            {storage.operation?.kind === 'audit' && storage.operation.zoneId === inspection.zone.id && storage.operation.issues.length ? (
              <div className="storage-audit-issues">
                {storage.operation.issues.slice(0, 12).map((issue, index) => <p key={`${issue.code}:${issue.position.x}:${issue.position.y}:${issue.position.z}:${index}`} data-severity={issue.severity}>{issue.message} ({issue.position.x}, {issue.position.y}, {issue.position.z})</p>)}
                {storage.operation.issueCount > 12 ? <small>{storage.operation.issueCount - 12} more issues are available through storage status.</small> : null}
              </div>
            ) : null}
            {inspection.scan?.failures.length ? <p className="storage-warning">{inspection.scan.failures.length} container scans failed. Run storage inspect in the terminal for details.</p> : null}
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

export { scanLabel };
