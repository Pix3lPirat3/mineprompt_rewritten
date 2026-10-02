'use strict';

const { compileSchema } = require('./schema');

class ActionDispatcher {
  constructor({ audit = () => {} } = {}) {
    this.actions = new Map();
    this.policies = [];
    this.audit = audit;
  }

  register(action) {
    if (!action?.id || typeof action.execute !== 'function') throw new TypeError('An action id and executor are required.');
    const registered = Object.freeze({
      risk: 'standard',
      capability: null,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      ...action,
      validate: compileSchema(action.inputSchema || { type: 'object', properties: {}, additionalProperties: false })
    });
    this.actions.set(registered.id, registered);
    return () => this.actions.delete(registered.id);
  }

  registerPolicy(id, evaluate) {
    if (!id || typeof evaluate !== 'function') throw new TypeError('A policy id and evaluator are required.');
    this.policies = this.policies.filter((policy) => policy.id !== id);
    this.policies.push({ id, evaluate });
    return () => { this.policies = this.policies.filter((policy) => policy.id !== id); };
  }

  get(id) {
    return this.actions.get(String(id || '')) || null;
  }

  list() {
    return [...this.actions.values()].map(({ execute, validate, ...action }) => ({ ...action }));
  }

  evaluate(action, context) {
    const result = { visible: true, enabled: true, reason: '', relationshipProtected: false, overrideAllowed: false };
    for (const policy of this.policies) {
      const decision = policy.evaluate({ action, ...context });
      if (!decision) continue;
      if (decision.visible === false) result.visible = false;
      if (decision.enabled === false) result.enabled = false;
      if (decision.reason && !result.reason) result.reason = String(decision.reason);
      if (decision.relationshipProtected === true) result.relationshipProtected = true;
      if (decision.overrideAllowed === true) result.overrideAllowed = true;
    }
    return result;
  }

  async execute(actionId, input, context = {}) {
    const startedAt = Date.now();
    try {
      const action = this.get(actionId);
      if (!action) throw new Error('Unknown action.');
      action.validate(input);
      const availability = this.evaluate(action, { ...context, request: input });
      if (!availability.visible || !availability.enabled) throw new Error(availability.reason || 'That action is not currently available.');
      const value = await action.execute({ action, request: input, ...context });
      this.audit({ actionId: action.id, status: 'completed', startedAt, finishedAt: Date.now(), input, origin: context.origin || null });
      return value;
    } catch (error) {
      this.audit({ actionId: String(actionId || ''), status: 'failed', startedAt, finishedAt: Date.now(), input, origin: context.origin || null, error: error.message });
      throw error;
    }
  }
}

module.exports = { ActionDispatcher };
