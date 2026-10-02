import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { useAppSelector } from '../../store';
import type { BlueprintMaterial, BlueprintSummary, TargetPosition } from '../../types';

interface BlueprintLibraryProps {
  close(): void;
}

interface BlueprintDetails {
  materials: BlueprintMaterial[];
  unsupportedBlocks: string[];
  supportSensitiveBlocks: string[];
}

interface BlueprintPreview {
  warnings: string[];
  counts: Record<string, number>;
  requirements: Array<{ name: string; count: number; available: number; missing: number }>;
  removals: Array<{ name: string; count: number }>;
}

interface BlueprintPlan {
  graph: { counts: { operations: number; removals: number; placements: number; blocked: number; scaffolded: number; groups: number }; cyclicCount: number };
  stances: { counts: { stances: number; covered: number; blocked: number }; estimatedTravel: number; uncoveredCount: number };
}

function message(error: unknown) {
  return String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': Error: /u, '');
}

function positionDefaults(value: string | null): TargetPosition {
  const values = String(value || '').match(/-?\d+(?:\.\d+)?/gu)?.slice(0, 3).map((entry) => Math.floor(Number(entry))) || [];
  return values.length === 3 ? { x: values[0]!, y: values[1]!, z: values[2]! } : { x: 0, y: 64, z: 0 };
}

function dimensions(blueprint: BlueprintSummary) {
  return `${blueprint.dimensions.x} x ${blueprint.dimensions.y} x ${blueprint.dimensions.z}`;
}

export function BlueprintLibrary({ close }: BlueprintLibraryProps) {
  const runtime = useAppSelector((state) => state.runtime);
  const blueprints = runtime.session.blueprints?.blueprints || [];
  const [selectedId, setSelectedId] = useState(blueprints[0]?.id || '');
  const selected = useMemo(() => blueprints.find((entry) => entry.id === selectedId) || blueprints[0] || null, [blueprints, selectedId]);
  const [details, setDetails] = useState<BlueprintDetails | null>(null);
  const [preview, setPreview] = useState<BlueprintPreview | null>(null);
  const [plan, setPlan] = useState<BlueprintPlan | null>(null);
  const [version, setVersion] = useState('');
  const [name, setName] = useState('');
  const initialPosition = positionDefaults(runtime.state.position);
  const [anchor, setAnchor] = useState(initialPosition);
  const [rotation, setRotation] = useState(0);
  const [mirror, setMirror] = useState('none');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState('');

  useEffect(() => {
    setDetails(null);
    setPreview(null);
    setPlan(null);
    setPendingRemove('');
  }, [selected?.id]);

  const loadDetails = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.mineprompt.blueprintAction({ sessionId: runtime.selectedSessionId, action: 'materials', blueprint: selected.id });
      setDetails({
        materials: Array.isArray(result.materials) ? result.materials as BlueprintMaterial[] : [],
        unsupportedBlocks: Array.isArray(result.unsupportedBlocks) ? result.unsupportedBlocks as string[] : [],
        supportSensitiveBlocks: Array.isArray(result.supportSensitiveBlocks) ? result.supportSensitiveBlocks as string[] : []
      });
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const importBlueprint = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await window.mineprompt.importBlueprint({
        sessionId: runtime.selectedSessionId,
        edition: 'java',
        version: version.trim() || undefined,
        name: name.trim() || undefined
      });
      if (result.blueprint) {
        setSelectedId(result.blueprint.id);
        setName('');
      }
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const removeBlueprint = async () => {
    if (!selected) return;
    if (pendingRemove !== selected.id) {
      setPendingRemove(selected.id);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await window.mineprompt.removeBlueprint({ sessionId: runtime.selectedSessionId, blueprint: selected.id });
      setSelectedId('');
      setPendingRemove('');
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const previewBlueprint = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.mineprompt.blueprintAction({
        sessionId: runtime.selectedSessionId,
        action: 'preview',
        blueprint: selected.id,
        anchor,
        rotation,
        mirror
      });
      setPreview(result.preview as BlueprintPreview);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const planBlueprint = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.mineprompt.blueprintAction({
        sessionId: runtime.selectedSessionId,
        action: 'plan',
        blueprint: selected.id,
        anchor,
        rotation,
        mirror
      });
      setPlan(result.plan as BlueprintPlan);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal eyebrow="Build" title="Blueprint library" close={close}>
      <div className="blueprint-library">
        <aside>
          <div className="blueprint-import">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional name" aria-label="Blueprint name" />
            <input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="Version for legacy files" aria-label="Minecraft version" />
            <button className="primary" type="button" disabled={busy} onClick={() => void importBlueprint()}>Choose schematic</button>
          </div>
          <div className="blueprint-list">
            {blueprints.map((blueprint) => (
              <button className={selected?.id === blueprint.id ? 'selected' : ''} type="button" key={blueprint.id} onClick={() => setSelectedId(blueprint.id)}>
                <strong>{blueprint.name}</strong>
                <span>{blueprint.version}, {dimensions(blueprint)}</span>
                <small>{blueprint.materialCount.toLocaleString()} blocks</small>
              </button>
            ))}
            {!blueprints.length ? <p>No imported blueprints</p> : null}
          </div>
        </aside>
        <main>
          {selected ? (
            <>
              <header className="blueprint-summary">
                <div><h3>{selected.name}</h3><span>{selected.sourceFormat}, Java {selected.version}</span></div>
                <code>{selected.id}</code>
              </header>
              <dl className="blueprint-metrics">
                <div><dt>Size</dt><dd>{dimensions(selected)}</dd></div>
                <div><dt>Blocks</dt><dd>{selected.materialCount.toLocaleString()}</dd></div>
                <div><dt>Materials</dt><dd>{selected.materialTypes}</dd></div>
                <div><dt>Block entities</dt><dd>{selected.blockEntityCount}</dd></div>
              </dl>
              <div className="blueprint-actions">
                <button type="button" disabled={busy} onClick={() => void loadDetails()}>Materials</button>
                <button className={pendingRemove === selected.id ? 'danger' : ''} type="button" disabled={busy} onClick={() => void removeBlueprint()}>{pendingRemove === selected.id ? 'Confirm remove' : 'Remove'}</button>
              </div>
              {details ? (
                <section className="blueprint-materials">
                  {details.materials.map((material) => <div key={material.name}><span>{material.displayName}</span><strong>{material.count.toLocaleString()}</strong></div>)}
                  {!details.materials.length ? <p>No placeable materials</p> : null}
                  {details.unsupportedBlocks.length ? <p className="form-error">Unsupported: {details.unsupportedBlocks.join(', ')}</p> : null}
                  {details.supportSensitiveBlocks.length ? <p>{details.supportSensitiveBlocks.length} placement-sensitive block states</p> : null}
                </section>
              ) : null}
              <section className="blueprint-preview-controls">
                <div className="coordinate-fields">
                  {(['x', 'y', 'z'] as const).map((axis) => <label key={axis}><span>{axis.toUpperCase()}</span><input type="number" value={anchor[axis]} onChange={(event) => setAnchor((current) => ({ ...current, [axis]: Number(event.target.value) }))} /></label>)}
                </div>
                <label><span>Rotation</span><select value={rotation} onChange={(event) => setRotation(Number(event.target.value))}><option value="0">0</option><option value="90">90</option><option value="180">180</option><option value="270">270</option></select></label>
                <label><span>Mirror</span><select value={mirror} onChange={(event) => setMirror(event.target.value)}><option value="none">None</option><option value="x">X</option><option value="z">Z</option></select></label>
                <button className="primary" type="button" disabled={busy || runtime.state.status !== 'online'} onClick={() => void previewBlueprint()}>Compare with world</button>
                <button type="button" disabled={busy || runtime.state.status !== 'online'} onClick={() => void planBlueprint()}>Compile plan</button>
              </section>
              {preview ? (
                <section className="blueprint-preview">
                  <div>{Object.entries(preview.counts).map(([label, value]) => <span key={label}><strong>{value.toLocaleString()}</strong>{label.replace(/[A-Z]/gu, (letter) => ` ${letter.toLowerCase()}`)}</span>)}</div>
                  {preview.warnings.map((warning) => <p className="form-error" key={warning}>{warning}</p>)}
                  {preview.requirements.length ? <p>{preview.requirements.filter((entry) => entry.missing > 0).map((entry) => `${entry.missing} ${entry.name}`).join(', ') || 'All required materials are in inventory'}</p> : null}
                </section>
              ) : null}
              {plan ? (
                <section className="blueprint-preview">
                  <div>
                    <span><strong>{plan.graph.counts.operations.toLocaleString()}</strong>operations</span>
                    <span><strong>{plan.graph.counts.blocked.toLocaleString()}</strong>blocked</span>
                    <span><strong>{plan.graph.counts.scaffolded.toLocaleString()}</strong>need scaffold</span>
                    <span><strong>{plan.stances.counts.stances.toLocaleString()}</strong>stances</span>
                    <span><strong>{plan.stances.estimatedTravel.toFixed(1)}</strong>travel</span>
                  </div>
                  {plan.graph.cyclicCount || plan.stances.uncoveredCount ? <p className="form-error">{plan.graph.cyclicCount} cyclic operations, {plan.stances.uncoveredCount} without a safe stance</p> : null}
                </section>
              ) : null}
            </>
          ) : <div className="blueprint-empty">Import a .schem or .schematic file to inspect it.</div>}
          {error ? <p className="form-error blueprint-error" role="alert">{error}</p> : null}
        </main>
      </div>
    </Modal>
  );
}
