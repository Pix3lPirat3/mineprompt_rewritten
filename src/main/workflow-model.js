'use strict';

const crypto = require('node:crypto');

const WORKFLOW_RESOURCES = Object.freeze(['movement', 'combat', 'chat', 'inventory', 'world']);
const STEP_TYPES = new Set(['command', 'wait']);

function cleanWorkflow(input, createId = () => crypto.randomUUID()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Workflow details are required.');
  const name = String(input.name || '').trim();
  if (!name || name.length > 64) throw new Error('Workflow name must contain 1 to 64 characters.');
  const id = String(input.id || createId()).trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/u.test(id)) throw new Error('Workflow id is invalid.');
  const description = String(input.description || '').trim().slice(0, 240);
  const repeat = Number(input.repeat ?? 1);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 100) throw new Error('Workflow repeat count must be from 1 to 100.');
  const resources = [...new Set((Array.isArray(input.resources) ? input.resources : []).map(String))];
  if (resources.some((resource) => !WORKFLOW_RESOURCES.includes(resource))) throw new Error('Workflow contains an invalid resource.');
  const sourceSteps = Array.isArray(input.steps) ? input.steps : [];
  if (!sourceSteps.length || sourceSteps.length > 100) throw new Error('Workflow must contain 1 to 100 steps.');
  const steps = sourceSteps.map((step, index) => {
    const type = String(step?.type || 'command');
    if (!STEP_TYPES.has(type)) throw new Error(`Workflow step ${index + 1} has an invalid type.`);
    const stepId = String(step.id || createId()).trim();
    if (!/^[A-Za-z0-9_-]{1,80}$/u.test(stepId)) throw new Error(`Workflow step ${index + 1} has an invalid id.`);
    if (type === 'wait') {
      const durationMs = Number(step.durationMs ?? 1000);
      if (!Number.isInteger(durationMs) || durationMs < 50 || durationMs > 3600000) throw new Error(`Workflow wait step ${index + 1} is out of range.`);
      return { id: stepId, type, durationMs };
    }
    const command = String(step.command || '').trim();
    if (!command || command.length > 4096) throw new Error(`Workflow command step ${index + 1} is empty or too long.`);
    return { id: stepId, type, command };
  });
  if (new Set(steps.map((step) => step.id)).size !== steps.length) throw new Error('Workflow step ids must be unique.');
  return { id, name, description, repeat, resources, steps };
}

module.exports = { WORKFLOW_RESOURCES, cleanWorkflow };
