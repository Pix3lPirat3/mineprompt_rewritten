import { useEffect, useState } from 'react';
import { shallowEqual } from 'react-redux';
import { Modal } from '../../components/Modal';
import { useAppSelector } from '../../store';
import type { WorkflowDefinition, WorkflowStep } from '../../types';

interface WorkflowStudioProps {
  close(): void;
}

const resources = ['movement', 'combat', 'chat', 'inventory', 'world'];

function identifier() {
  return globalThis.crypto.randomUUID();
}

function emptyWorkflow(): WorkflowDefinition {
  return {
    id: identifier(),
    name: 'New workflow',
    description: '',
    repeat: 1,
    resources: [],
    steps: [{ id: identifier(), type: 'command', command: 'ping' }]
  };
}

function cleanError(error: unknown) {
  return String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': Error: /u, '');
}

export function WorkflowStudio({ close }: WorkflowStudioProps) {
  const runtime = useAppSelector((state) => ({
    workflows: state.runtime.workflows,
    selectedSessionId: state.runtime.selectedSessionId
  }), shallowEqual);
  const [selectedId, setSelectedId] = useState(runtime.workflows[0]?.id || '');
  const [draft, setDraft] = useState<WorkflowDefinition>(() => runtime.workflows[0] ? structuredClone(runtime.workflows[0]) : emptyWorkflow());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const workflow = runtime.workflows.find((entry) => entry.id === selectedId);
    if (workflow) setDraft(structuredClone(workflow));
  }, [runtime.workflows, selectedId]);

  const updateStep = (id: string, update: Partial<WorkflowStep>) => {
    setDraft((current) => ({ ...current, steps: current.steps.map((step) => step.id === id ? { ...step, ...update } as WorkflowStep : step) }));
  };
  const moveStep = (index: number, direction: number) => {
    const target = index + direction;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    const currentStep = steps[index];
    const targetStep = steps[target];
    if (!currentStep || !targetStep) return;
    steps[index] = targetStep;
    steps[target] = currentStep;
    setDraft({ ...draft, steps });
  };
  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const result = await window.mineprompt.saveWorkflow(draft);
      setSelectedId(result.workflow.id);
      setDraft(structuredClone(result.workflow));
      return result.workflow;
    } catch (caught) {
      setError(cleanError(caught));
      return null;
    } finally {
      setSaving(false);
    }
  };
  const run = async () => {
    const workflow = await save();
    if (!workflow) return;
    try {
      await window.mineprompt.runWorkflow({ workflowId: workflow.id, sessionId: runtime.selectedSessionId });
    } catch (caught) {
      setError(cleanError(caught));
    }
  };

  return (
    <Modal eyebrow="Automation" title="Workflow studio" close={close}>
      <div className="workflow-studio">
        <aside>
          <button className="primary" type="button" onClick={() => {
            const workflow = emptyWorkflow();
            setSelectedId('');
            setDraft(workflow);
          }}>New workflow</button>
          <div className="workflow-library">
            {runtime.workflows.map((workflow) => <button type="button" className={workflow.id === selectedId ? 'selected' : ''} key={workflow.id} onClick={() => setSelectedId(workflow.id)}><strong>{workflow.name}</strong><small>{workflow.steps.length} steps, repeats {workflow.repeat}</small></button>)}
            {!runtime.workflows.length ? <p>No saved workflows.</p> : null}
          </div>
        </aside>
        <section className="workflow-editor">
          <div className="workflow-fields">
            <label><span>Name</span><input value={draft.name} maxLength={64} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label><span>Repeat</span><input type="number" min="1" max="100" value={draft.repeat} onChange={(event) => setDraft({ ...draft, repeat: Number(event.target.value) })} /></label>
            <label className="wide"><span>Description</span><input value={draft.description} maxLength={240} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          </div>
          <fieldset className="workflow-resources"><legend>Exclusive resources</legend>{resources.map((resource) => <label key={resource}><input type="checkbox" checked={draft.resources.includes(resource)} onChange={(event) => setDraft({ ...draft, resources: event.target.checked ? [...draft.resources, resource] : draft.resources.filter((entry) => entry !== resource) })} /><span>{resource}</span></label>)}</fieldset>
          <div className="workflow-canvas">
            {draft.steps.map((step, index) => (
              <article className="workflow-node" key={step.id}>
                <header><span>Step {index + 1}</span><select value={step.type} onChange={(event) => updateStep(step.id, event.target.value === 'wait' ? { type: 'wait', durationMs: 1000, command: undefined } : { type: 'command', command: 'ping', durationMs: undefined })}><option value="command">Command</option><option value="wait">Wait</option></select></header>
                {step.type === 'command' ? <input value={step.command || ''} onChange={(event) => updateStep(step.id, { command: event.target.value })} placeholder="follow PlayerName" spellCheck={false} /> : <label><span>Milliseconds</span><input type="number" min="50" max="3600000" value={step.durationMs || 1000} onChange={(event) => updateStep(step.id, { durationMs: Number(event.target.value) })} /></label>}
                <footer><button type="button" disabled={index === 0} onClick={() => moveStep(index, -1)}>Move up</button><button type="button" disabled={index === draft.steps.length - 1} onClick={() => moveStep(index, 1)}>Move down</button><button className="danger" type="button" disabled={draft.steps.length === 1} onClick={() => setDraft({ ...draft, steps: draft.steps.filter((entry) => entry.id !== step.id) })}>Remove</button></footer>
              </article>
            ))}
            <button className="workflow-add" type="button" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { id: identifier(), type: 'command', command: '' }] })}>Add step</button>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <footer className="workflow-footer">
            {selectedId ? <button className="danger" type="button" onClick={() => void window.mineprompt.removeWorkflow(selectedId).then(() => { const next = emptyWorkflow(); setSelectedId(''); setDraft(next); }).catch((caught) => setError(cleanError(caught)))}>Delete</button> : <span />}
            <span><button type="button" disabled={saving} onClick={() => void save()}>Save</button><button className="primary" type="button" disabled={saving} onClick={() => void run()}>Save and run</button></span>
          </footer>
        </section>
      </div>
    </Modal>
  );
}
