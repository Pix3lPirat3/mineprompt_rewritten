import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRuntime } from '../../test-utils';
import { Dialogs } from './Dialogs';

describe('connection dialog', () => {
  it('connects with the selected installed engine', async () => {
    const connect = vi.fn(async () => ({ ok: true, sessionId: 'primary' }));
    const close = vi.fn();
    const view = renderWithRuntime(<Dialogs target={{ kind: 'connect' }} close={close} />, {
      api: { connect },
      snapshot: {
        engines: {
          profiles: [
            { id: 'stable', profile: 'stable', name: 'Stable', edition: 'java', revision: '2.0.0' },
            { id: 'bedrock-preview', profile: 'bedrock', name: 'Bedrock Preview', edition: 'bedrock', revision: 'a'.repeat(64) }
          ],
          catalog: []
        }
      }
    });
    await view.user.type(screen.getByLabelText('Account name or email'), 'PreviewBot');
    await view.user.type(screen.getByLabelText('Server address'), 'localhost');
    await view.user.selectOptions(screen.getByLabelText('Engine'), 'bedrock-preview');
    expect((screen.getByLabelText('Port') as HTMLInputElement).value).toBe('19132');
    await view.user.click(screen.getByRole('button', { name: 'Connect bot' }));
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ engineProfileId: 'bedrock-preview' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
