import { useState } from 'react';
import { shallowEqual } from 'react-redux';
import type { Account, BotSession, ServerProfile } from '../../types';
import { playerHead } from '../../assets';
import { ContextMenu, type MenuEntry } from '../../components/ContextMenu';
import { useAppSelector } from '../../store';

export type DialogTarget =
  | { kind: 'connect'; account?: Account; server?: ServerProfile }
  | { kind: 'profile'; account?: Account }
  | { kind: 'server'; server?: ServerProfile }
  | { kind: 'settings' }
  | { kind: 'mining' }
  | { kind: 'workflows' }
  | { kind: 'commands' };

interface SidebarProps {
  open(target: DialogTarget): void;
}

interface BotMenu {
  session: BotSession;
  account?: Account;
  x: number;
  y: number;
}

export function Sidebar({ open }: SidebarProps) {
  const runtime = useAppSelector((state) => ({
    version: state.runtime.version,
    selectedSessionId: state.runtime.selectedSessionId,
    accounts: state.runtime.accounts,
    servers: state.runtime.servers,
    externalPlayerHeadsEnabled: state.runtime.preferences.externalPlayerHeadsEnabled
  }), shallowEqual);
  const sessions = useAppSelector((state) => state.runtime.sessions, (before, after) =>
    before.length === after.length && before.every((session, index) => {
      const next = after[index];
      if (!next) return false;
      return session.id === next.id &&
        session.state.status === next.state.status &&
        session.state.username === next.state.username &&
        session.state.displayName === next.state.displayName &&
        session.engine?.id === next.engine?.id &&
        session.session.server?.host === next.session.server?.host &&
        session.session.server?.port === next.session.server?.port;
    })
  );
  const [menu, setMenu] = useState<BotMenu | null>(null);
  const visibleSessions = sessions.filter((entry) => entry.state.username || entry.session.server || entry.state.status !== 'disconnected');
  const activeNames = new Set(visibleSessions.map((entry) => entry.state.username?.toLowerCase()).filter(Boolean));
  const availableAccounts = runtime.accounts.filter((account) => !activeNames.has(account.username.toLowerCase()));
  const active = visibleSessions.some((entry) => entry.state.status !== 'disconnected');
  const menuEntries: MenuEntry[] = menu ? [
    ...(menu.session.state.status !== 'disconnected' ? [{
      id: 'disconnect',
      label: 'Disconnect',
      run: async () => { await window.mineprompt.disconnect(menu.session.id); }
    }] : []),
    ...(menu.account ? [{ id: 'edit', label: 'Edit profile', run: () => open({ kind: 'profile', account: menu.account }) }] : []),
    ...(sessions.length > 1 ? [{
      id: 'close',
      label: 'Close session',
      danger: true,
      run: async () => { await window.mineprompt.closeSession(menu.session.id); }
    }] : [])
  ] : [];
  return (
    <aside className="sidebar">
      <header className="brand">
        <img src="img/heads/computer.png" alt="" />
        <h1>MinePrompt</h1>
      </header>
      <button className="primary-action" type="button" onClick={() => open({ kind: 'connect' })}>{active ? 'Connect another bot' : 'Connect bot'}</button>
      <nav className="sidebar-nav" aria-label="Application tools">
        <button type="button" onClick={() => open({ kind: 'workflows' })}>Workflow studio</button>
        <button type="button" onClick={() => open({ kind: 'commands' })}>Command library</button>
        <button type="button" onClick={() => open({ kind: 'mining' })}>Mining policies</button>
        <button type="button" onClick={() => open({ kind: 'settings' })}>Settings</button>
      </nav>
      <section className="sidebar-section">
        <header><h2>Bots</h2><button type="button" onClick={() => open({ kind: 'profile' })}>Add profile</button></header>
        <div className="sidebar-list">
          {visibleSessions.map((session) => {
            const account = runtime.accounts.find((entry) => entry.username.toLowerCase() === session.state.username?.toLowerCase());
            return (
              <article className={session.id === runtime.selectedSessionId ? 'selected' : ''} data-session-id={session.id} data-status={session.state.status} key={session.id}>
                <button type="button" className="sidebar-list__main" onClick={() => void window.mineprompt.selectSession(session.id)}>
                  <img src={playerHead(session.state.username, runtime.externalPlayerHeadsEnabled)} alt="" />
                  <span><strong>{session.state.displayName || session.state.username || 'Bot session'}</strong><small>{session.state.status}{session.session.server ? `, ${session.session.server.host}` : ''}{session.engine ? `, ${session.engine.name}` : ''}</small></span>
                </button>
                <button type="button" className="sidebar-list__edit" onClick={(event) => setMenu({ session, account, x: event.clientX, y: event.clientY })}>Manage</button>
              </article>
            );
          })}
          {availableAccounts.map((account) => (
            <article key={account.username}>
              <button type="button" className="sidebar-list__main" onClick={() => open({ kind: 'connect', account })}>
                <img src={playerHead(account.username, runtime.externalPlayerHeadsEnabled)} alt="" />
                <span><strong>{account.username}</strong><small>{account.authentication ? 'Microsoft' : 'Offline'}</small></span>
              </button>
              <button type="button" className="sidebar-list__edit" onClick={() => open({ kind: 'profile', account })}>Edit</button>
            </article>
          ))}
        </div>
      </section>
      <section className="sidebar-section sidebar-section--servers">
        <header><h2>Servers</h2><button type="button" onClick={() => open({ kind: 'server' })}>Add</button></header>
        <div className="sidebar-list server-list">
          {runtime.servers.map((server) => (
            <article key={server.name}>
              <button type="button" className="sidebar-list__main" onClick={() => open({ kind: 'connect', server, account: runtime.accounts[0] })}>
                <span><strong>{server.name}</strong><small>{server.host}:{server.port}</small></span>
              </button>
              <button type="button" className="sidebar-list__edit" onClick={() => open({ kind: 'server', server })}>Edit</button>
            </article>
          ))}
        </div>
      </section>
      <footer>
        <span>Version {runtime.version || 'loading'}</span>
        <a href="https://github.com/Pix3lPirat3/mineprompt_rewritten">GitHub repository</a>
      </footer>
      {menu ? <ContextMenu x={menu.x} y={menu.y} entries={menuEntries} close={() => setMenu(null)} /> : null}
    </aside>
  );
}
