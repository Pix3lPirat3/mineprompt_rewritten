'use strict';

const { cleanWorkflow } = require('./workflow-model');

function abortableDelay(durationMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason || new Error('Workflow stopped.'));
      return;
    }
    const completed = () => {
      signal.removeEventListener('abort', aborted);
      resolve();
    };
    const aborted = () => {
      clearTimeout(timer);
      reject(signal.reason || new Error('Workflow stopped.'));
    };
    const timer = setTimeout(completed, durationMs);
    signal.addEventListener('abort', aborted, { once: true });
  });
}

class WorkflowRunner {
  constructor({ automation, commands, logger }) {
    this.automation = automation;
    this.commands = commands;
    this.logger = logger;
  }

  run(input, sessionId) {
    const workflow = cleanWorkflow(input);
    const activityId = `workflow:${workflow.id}`;
    this.automation.start({
      id: activityId,
      label: workflow.name,
      detail: 'Starting workflow',
      resources: workflow.resources,
      run: async (signal, { update }) => {
        for (let pass = 0; pass < workflow.repeat; pass += 1) {
          for (let index = 0; index < workflow.steps.length; index += 1) {
            if (signal.aborted) throw signal.reason || new Error('Workflow stopped.');
            const step = workflow.steps[index];
            update(`Pass ${pass + 1}/${workflow.repeat}, step ${index + 1}/${workflow.steps.length}`);
            if (step.type === 'wait') await abortableDelay(step.durationMs, signal);
            else {
              const result = await this.commands.execute(step.command, {
                type: 'automation',
                sessionId,
                capabilities: workflow.resources,
                reply: this.logger.log
              });
              if (!result.ok) throw new Error(result.error || `Command failed: ${step.command}`);
            }
          }
        }
        this.logger.info(`[Workflow] ${workflow.name} completed.`);
      }
    });
    return { workflowId: workflow.id, activityId };
  }

  stop(workflowId) {
    return this.automation.stop(`workflow:${String(workflowId)}`);
  }

  close() {
    this.automation.close();
  }
}

module.exports = { WorkflowRunner, abortableDelay };
