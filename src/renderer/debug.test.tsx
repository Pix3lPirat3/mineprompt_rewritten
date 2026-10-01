import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FeatureErrorBoundary } from './components/FeatureErrorBoundary';
import { installRendererDiagnostics, reportReactIssue, reportRendererIssue, subscribeRendererIssues } from './debug';

describe('renderer diagnostics', () => {
  it('captures structured failures without repeating identical issues', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const received: Array<{ area: string; message: string; context: Record<string, unknown> }> = [];
    const stop = subscribeRendererIssues((issue) => received.push(issue));
    reportRendererIssue('Assets', 'Texture failed.', { source: 'missing.png', attempts: 2 });
    reportRendererIssue('Assets', 'Texture failed.', { source: 'missing.png', attempts: 2 });
    expect(received.filter((issue) => issue.message === 'Texture failed.')).toHaveLength(1);
    expect(received.at(-1)?.context).toEqual({ source: 'missing.png', attempts: 2 });
    stop();
    warning.mockRestore();
  });

  it('captures unhandled renderer errors', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const received: string[] = [];
    installRendererDiagnostics();
    const stop = subscribeRendererIssues((issue) => received.push(issue.message));
    window.dispatchEvent(new ErrorEvent('error', { message: 'Render failed' }));
    expect(received).toContain('Render failed');
    stop();
    warning.mockRestore();
  });

  it('records React component stacks and contains feature failures', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const received: Array<{ area: string; context: Record<string, unknown> }> = [];
    const stop = subscribeRendererIssues((issue) => received.push(issue));
    reportReactIssue('caught', new Error('Inventory render failed'), '\n    at InventorySlot', { windowId: 4 });
    const issue = received.findLast((entry) => entry.area === 'React');
    expect(issue?.context.componentStack).toContain('InventorySlot');
    expect(issue?.context.windowId).toBe(4);
    const BrokenInventory = () => { throw new Error('Broken inventory'); };
    render(<FeatureErrorBoundary label="Inventory workspace"><BrokenInventory /></FeatureErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toContain('Inventory workspace stopped');
    stop();
    error.mockRestore();
    warning.mockRestore();
  });
});
