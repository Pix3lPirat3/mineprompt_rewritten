import { useEffect, useState } from 'react';
import { configureItemTexture } from '../../assets';
import { Modal } from '../../components/Modal';
import { consoleActions, useAppDispatch, useAppSelector } from '../../store';
import type { StorageScanDetails, StorageZoneSummary } from '../../types';

type Inspection = { zone: StorageZoneSummary; scan: StorageScanDetails | null };

function scanLabel(zone: StorageZoneSummary) {
  const scan = zone.scan;
  if (!scan) return 'Not scanned';
  if (scan.running) return `${scan.containersScanned}/${scan.containersFound} containers`;
  return `${scan.itemCount} items, ${scan.containersScanned} containers${scan.stale ? ', stale' : ''}`;
}

export function StorageRibbon() {
  const dispatch = useAppDispatch();
  const sessionId = useAppSelector((state) => state.runtime.selectedSessionId);
  const status = useAppSelector((state) => state.runtime.state.status);
  const storage = useAppSelector((state) => state.runtime.session.storage);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setInspection(null), [sessionId]);

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

  if (!storage?.zones.length) return null;

  return (
    <section className="storage-ribbon" aria-label="Storage zones">
      <div className="storage-ribbon__label"><strong>Storage</strong><small>{storage.zones.length}</small></div>
      <div className="storage-ribbon__list">
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
              </span>
            </header>
            {inspection.scan?.items.length ? (
              <div className="storage-item-grid">
                {inspection.scan.items.map((item) => (
                  <article key={item.variantId} title={`${item.displayName}\nVariant ${item.variantId}${item.lore.length ? `\n${item.lore.join('\n')}` : ''}`}>
                    <img ref={(image) => configureItemTexture(image, item.name)} alt="" />
                    <span><strong>{item.displayName}</strong><small>{item.count} total</small></span>
                  </article>
                ))}
              </div>
            ) : <p className="storage-empty">{inspection.scan ? 'No items were indexed.' : 'Scan this zone to build its item index.'}</p>}
            {inspection.scan?.failures.length ? <p className="storage-warning">{inspection.scan.failures.length} container scans failed. Run storage inspect in the terminal for details.</p> : null}
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

export { scanLabel };
