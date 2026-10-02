import { useMemo, useState, type FormEvent } from 'react';
import { shallowEqual } from 'react-redux';
import { Modal } from '../../components/Modal';
import { consoleActions, uiActions, useAppDispatch, useAppSelector } from '../../store';
import type { Preferences } from '../../types';
import type { DialogTarget } from './Sidebar';
import { WorkflowStudio } from '../automation/WorkflowStudio';
import { MiningPolicyEditor } from '../mining/MiningPolicyEditor';

interface DialogsProps {
  target: DialogTarget;
  close(): void;
}

function message(error: unknown): string {
  return String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': Error: /u, '');
}

function FormError({ value }: { value: string }) {
  return value ? <p className="form-error" role="alert">{value}</p> : null;
}

export function Dialogs({ target, close }: DialogsProps) {
  const runtime = useAppSelector((state) => ({
    accounts: state.runtime.accounts,
    servers: state.runtime.servers,
    preferences: state.runtime.preferences,
    commands: state.runtime.commands,
    status: state.runtime.state.status
  }), shallowEqual);
  const dispatch = useAppDispatch();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const commands = useMemo(() => runtime.commands.filter((command) =>
    [command.command, command.category, command.description, ...command.aliases].join(' ').toLowerCase().includes(query.trim().toLowerCase())), [query, runtime.commands]);

  if (target.kind === 'workflows') return <WorkflowStudio close={close} />;
  if (target.kind === 'mining') return <MiningPolicyEditor close={close} />;

  if (target.kind === 'connect') {
    const account = target.account || runtime.accounts[0];
    const server = target.server;
    const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError('');
      const values = new FormData(event.currentTarget);
      try {
        await window.mineprompt.connect({
          username: values.get('username'),
          auth: values.get('auth'),
          host: values.get('host'),
          port: Number(values.get('port')),
          version: values.get('version'),
          fakeHost: values.get('fakeHost')
        });
        close();
      } catch (caught) {
        setError(message(caught));
      }
    };
    return (
      <Modal eyebrow="New session" title="Connect a bot" close={close}>
        <form className="form-grid" onSubmit={(event) => void submit(event)}>
          <label className="wide"><span>Account name or email</span><input name="username" defaultValue={account?.username || ''} required autoComplete="username" /></label>
          <label><span>Authentication</span><select name="auth" defaultValue={account?.authentication === false ? 'offline' : 'microsoft'}><option value="microsoft">Microsoft</option><option value="offline">Offline</option></select></label>
          <label className="wide"><span>Server address</span><input name="host" defaultValue={server?.host || ''} required spellCheck={false} /></label>
          <label><span>Port</span><input name="port" type="number" min="1" max="65535" defaultValue={server?.port || 25565} required /></label>
          <label><span>Version</span><input name="version" defaultValue={server?.version || ''} placeholder="Automatic" spellCheck={false} /></label>
          <label className="wide"><span>Handshake address</span><input name="fakeHost" defaultValue={server?.fakeHost || ''} placeholder="Optional" spellCheck={false} /></label>
          <FormError value={error} />
          <footer><button type="button" onClick={close}>Cancel</button><button className="primary" type="submit">Connect bot</button></footer>
        </form>
      </Modal>
    );
  }

  if (target.kind === 'profile') {
    const account = target.account;
    const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      try {
        await window.mineprompt.saveProfile({ originalUsername: account?.username, username: values.get('username'), authentication: values.get('authentication') });
        close();
      } catch (caught) { setError(message(caught)); }
    };
    return (
      <Modal eyebrow="Profile" title={account ? 'Edit profile' : 'Add profile'} close={close}>
        <form className="form-grid" onSubmit={(event) => void submit(event)}>
          <label className="wide"><span>Account name or email</span><input name="username" defaultValue={account?.username || ''} required autoComplete="username" /></label>
          <label><span>Authentication</span><select name="authentication" defaultValue={account?.authentication === false ? 'offline' : 'microsoft'}><option value="microsoft">Microsoft</option><option value="offline">Offline</option></select></label>
          <FormError value={error} />
          <footer className="split">{account ? <button className="danger" type="button" onClick={() => void window.mineprompt.removeProfile(account.username).then(close).catch((caught) => setError(message(caught)))}>Delete</button> : <span />}<span><button type="button" onClick={close}>Cancel</button><button className="primary" type="submit">Save profile</button></span></footer>
        </form>
      </Modal>
    );
  }

  if (target.kind === 'server') {
    const server = target.server;
    const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      try {
        await window.mineprompt.saveServer({ originalName: server?.name, name: values.get('name'), host: values.get('host'), port: Number(values.get('port')), version: values.get('version'), fakeHost: values.get('fakeHost') });
        close();
      } catch (caught) { setError(message(caught)); }
    };
    return (
      <Modal eyebrow="Server profile" title={server ? 'Edit server' : 'Add server'} close={close}>
        <form className="form-grid" onSubmit={(event) => void submit(event)}>
          <label className="wide"><span>Name</span><input name="name" defaultValue={server?.name || ''} required /></label>
          <label className="wide"><span>Server address</span><input name="host" defaultValue={server?.host || ''} required spellCheck={false} /></label>
          <label><span>Port</span><input name="port" type="number" min="1" max="65535" defaultValue={server?.port || 25565} required /></label>
          <label><span>Version</span><input name="version" defaultValue={server?.version || ''} placeholder="Automatic" /></label>
          <label className="wide"><span>Handshake address</span><input name="fakeHost" defaultValue={server?.fakeHost || ''} placeholder="Optional" /></label>
          <FormError value={error} />
          <footer className="split">{server ? <button className="danger" type="button" onClick={() => void window.mineprompt.removeServer(server.name).then(close).catch((caught) => setError(message(caught)))}>Delete</button> : <span />}<span><button type="button" onClick={close}>Cancel</button><button className="primary" type="submit">Save server</button></span></footer>
        </form>
      </Modal>
    );
  }

  if (target.kind === 'settings') {
    const preferences = runtime.preferences;
    const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const lines = (name: string) => String(values.get(name) || '').split(/\r?\n/gu).map((value) => value.trim()).filter(Boolean);
      const updated: Preferences = {
        ...preferences,
        resourcePackPolicy: values.get('resourcePackPolicy') === 'accept' ? 'accept' : 'deny',
        externalPlayerHeadsEnabled: values.has('externalPlayerHeadsEnabled'),
        automaticReconnectEnabled: values.has('automaticReconnectEnabled'),
        reconnectAttempts: Number(values.get('reconnectAttempts')),
        remoteCommandsEnabled: values.has('remoteCommandsEnabled'),
        remoteCommandPlayers: lines('remoteCommandPlayers'),
        friendPlayers: lines('friendPlayers')
      };
      try {
        await window.mineprompt.savePreferences(updated);
        close();
      } catch (caught) { setError(message(caught)); }
    };
    return (
      <Modal eyebrow="Application" title="Settings" close={close}>
        <form className="form-grid settings-form" onSubmit={(event) => void submit(event)}>
          <label><span>Server resource packs</span><select name="resourcePackPolicy" defaultValue={preferences.resourcePackPolicy}><option value="deny">Decline</option><option value="accept">Accept</option></select></label>
          <label><span>Reconnect attempts</span><input name="reconnectAttempts" type="number" min="1" max="10" defaultValue={preferences.reconnectAttempts} /></label>
          <label className="check wide"><input name="externalPlayerHeadsEnabled" type="checkbox" defaultChecked={preferences.externalPlayerHeadsEnabled} /><span>Load player heads from mc-heads.net</span></label>
          <label className="check wide"><input name="automaticReconnectEnabled" type="checkbox" defaultChecked={preferences.automaticReconnectEnabled} /><span>Reconnect unexpected disconnects</span></label>
          <label className="wide"><span>Friends, one name per line</span><textarea name="friendPlayers" rows={4} defaultValue={preferences.friendPlayers.join('\n')} /></label>
          <label className="check wide"><input name="remoteCommandsEnabled" type="checkbox" defaultChecked={preferences.remoteCommandsEnabled} /><span>Allow approved remote chat commands</span></label>
          <label className="wide"><span>Approved remote players</span><textarea name="remoteCommandPlayers" rows={4} defaultValue={preferences.remoteCommandPlayers.join('\n')} /></label>
          <FormError value={error} />
          <div className="settings-tools wide"><button type="button" onClick={() => void window.mineprompt.checkForUpdate()}>Check GitHub releases</button><button type="button" onClick={() => void window.mineprompt.exportDiagnostics()}>Export diagnostics</button></div>
          <footer><button type="button" onClick={close}>Cancel</button><button className="primary" type="submit">Save settings</button></footer>
        </form>
      </Modal>
    );
  }

  return (
    <Modal eyebrow="Explore" title="Command library" close={close}>
      <div className="command-browser">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands" autoFocus />
        <div>
          {commands.map((command) => (
            <button key={command.command} type="button" disabled={command.requiresConnection && runtime.status !== 'online'} onClick={() => {
              dispatch(consoleActions.commandPrepared(`${command.command} `));
              dispatch(uiActions.terminalOpened());
              close();
            }}>
              <span><strong>{command.command}</strong><small>{command.category}</small></span>
              <p>{command.description}</p>
              <code>{command.usage}</code>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
