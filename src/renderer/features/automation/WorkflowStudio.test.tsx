import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRuntime } from '../../test-utils';
import type { WorkflowDefinition } from '../../types';
import { WorkflowStudio } from './WorkflowStudio';

describe('workflow studio', () => {
  it('builds and saves a graphical workflow', async () => {
    const saveWorkflow = vi.fn(async (workflow: WorkflowDefinition) => ({ ok: true, workflow }));
    const { user } = renderWithRuntime(<WorkflowStudio close={() => {}} />, { api: { saveWorkflow }, snapshot: { workflows: [] } });
    await user.click(screen.getByRole('button', { name: 'Add step' }));
    expect(screen.getByText('Step 2')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveWorkflow).toHaveBeenCalledOnce();
    expect(saveWorkflow.mock.calls[0]?.[0].steps).toHaveLength(2);
  });
});
