import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { useAppSelector } from '../../store';
import type { MiningPolicy } from '../../types';

interface MiningPolicyEditorProps {
  close(): void;
}

const DEFAULT_POLICY: MiningPolicy = {
  tool: 'auto',
  lowDurability: 'switch',
  minimumDurability: 10,
  allowFluidAdjacent: false,
  allowFalling: false,
  include: [],
  exclude: [],
  reach: 4.8,
  maxBlocks: 4096
};

function message(error: unknown) {
  return String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': Error: /u, '');
}

function blockNames(value: string) {
  return value.split(/[\s,]+/gu).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
}

export function MiningPolicyEditor({ close }: MiningPolicyEditorProps) {
  const { miningPresets, activeMiningPresetId } = useAppSelector((state) => state.runtime);
  const [selectedId, setSelectedId] = useState(activeMiningPresetId || miningPresets[0]?.id || '');
  const selected = useMemo(() => miningPresets.find((preset) => preset.id === selectedId), [miningPresets, selectedId]);
  const [name, setName] = useState(selected?.name || '');
  const [policy, setPolicy] = useState<MiningPolicy>(selected?.policy || DEFAULT_POLICY);
  const [includeText, setIncludeText] = useState(selected?.policy.include.join(', ') || '');
  const [excludeText, setExcludeText] = useState(selected?.policy.exclude.join(', ') || '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedId) return;
    const preset = miningPresets.find((entry) => entry.id === selectedId);
    if (!preset) return;
    setName(preset.name);
    setPolicy(preset.policy);
    setIncludeText(preset.policy.include.join(', '));
    setExcludeText(preset.policy.exclude.join(', '));
    setError('');
  }, [selectedId]);

  const update = <Key extends keyof MiningPolicy>(key: Key, value: MiningPolicy[Key]) => setPolicy((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setError('');
    try {
      const result = await window.mineprompt.saveMiningPreset({ id: selected?.id, name, policy: { ...policy, include: blockNames(includeText), exclude: blockNames(excludeText) }, activate: true });
      setSelectedId(result.preset.id);
    } catch (caught) {
      setError(message(caught));
    }
  };
  const remove = async () => {
    if (!selected) return;
    setError('');
    try {
      await window.mineprompt.removeMiningPreset(selected.id);
      const remaining = miningPresets.filter((preset) => preset.id !== selected.id);
      setSelectedId(remaining[0]?.id || '');
      setName('');
      setPolicy(DEFAULT_POLICY);
      setIncludeText('');
      setExcludeText('');
    } catch (caught) {
      setError(message(caught));
    }
  };
  const select = async () => {
    setError('');
    try {
      await window.mineprompt.selectMiningPreset(selected?.id || null);
    } catch (caught) {
      setError(message(caught));
    }
  };

  return (
    <Modal eyebrow="Mining" title="Mining policies" close={close}>
      <div className="mining-policy-editor">
        <aside>
          <button type="button" className={!selectedId ? 'selected' : ''} onClick={() => { setSelectedId(''); setName(''); setPolicy(DEFAULT_POLICY); setIncludeText(''); setExcludeText(''); }}>New policy</button>
          {miningPresets.map((preset) => <button type="button" className={selectedId === preset.id ? 'selected' : ''} key={preset.id} onClick={() => setSelectedId(preset.id)}><strong>{preset.name}</strong>{activeMiningPresetId === preset.id ? <small>In use</small> : null}</button>)}
        </aside>
        <section className="form-grid">
          <label className="wide"><span>Name</span><input value={name} maxLength={48} onChange={(event) => setName(event.target.value)} autoFocus /></label>
          <label><span>Tool selection</span><select value={policy.tool} onChange={(event) => update('tool', event.target.value as MiningPolicy['tool'])}><option value="auto">Best safe tool</option><option value="held">Held tool</option><option value="hand">Empty hand</option></select></label>
          <label><span>Low durability</span><select value={policy.lowDurability} onChange={(event) => update('lowDurability', event.target.value as MiningPolicy['lowDurability'])}><option value="switch">Switch tools</option><option value="stop">Stop mining</option><option value="skip">Skip block</option></select></label>
          <label><span>Durability reserve</span><input type="number" min="0" max="65535" value={policy.minimumDurability} onChange={(event) => update('minimumDurability', Number(event.target.value))} /></label>
          <label><span>Reach</span><input type="number" min="3" max="5.5" step="0.1" value={policy.reach} onChange={(event) => update('reach', Number(event.target.value))} /></label>
          <label><span>Maximum region blocks</span><input type="number" min="1" max="16384" value={policy.maxBlocks} onChange={(event) => update('maxBlocks', Number(event.target.value))} /></label>
          <label className="check"><input type="checkbox" checked={policy.allowFalling} onChange={(event) => update('allowFalling', event.target.checked)} /><span>Allow falling blocks</span></label>
          <label className="check"><input type="checkbox" checked={policy.allowFluidAdjacent} onChange={(event) => update('allowFluidAdjacent', event.target.checked)} /><span>Allow fluid edges</span></label>
          <label className="wide"><span>Only mine these blocks</span><textarea rows={3} value={includeText} placeholder="Optional, separated by commas" onChange={(event) => setIncludeText(event.target.value)} /></label>
          <label className="wide"><span>Never mine these blocks</span><textarea rows={3} value={excludeText} placeholder="Optional, separated by commas" onChange={(event) => setExcludeText(event.target.value)} /></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <footer className="split"><span>{selected ? <button type="button" className="danger" onClick={() => void remove()}>Delete</button> : null}</span><span><button type="button" disabled={!selected || activeMiningPresetId === selected.id} onClick={() => void select()}>Use policy</button><button type="button" className="primary" onClick={() => void save()}>Save and use</button></span></footer>
        </section>
      </div>
    </Modal>
  );
}
