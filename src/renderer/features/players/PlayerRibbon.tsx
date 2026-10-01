import { useEffect, useMemo, useState } from 'react';
import { shallowEqual } from 'react-redux';
import { playerHead } from '../../assets';
import { ContextMenu, type MenuEntry } from '../../components/ContextMenu';
import { useHorizontalDrag } from '../../components/useHorizontalDrag';
import { consoleActions, uiActions, useAppDispatch, useAppSelector } from '../../store';
import type { PlayerPresence } from '../../types';

interface OpenMenu {
  player: PlayerPresence;
  x: number;
  y: number;
}

export function PlayerRibbon() {
  const dispatch = useAppDispatch();
  const filter = useAppSelector((state) => state.ui.playerFilter);
  const runtime = useAppSelector((state) => ({
    selectedSessionId: state.runtime.selectedSessionId,
    status: state.runtime.state.status,
    players: state.runtime.session.players,
    username: state.runtime.session.username,
    externalPlayerHeadsEnabled: state.runtime.preferences.externalPlayerHeadsEnabled
  }), shallowEqual);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [overridePressed, setOverridePressed] = useState(false);
  const scroll = useHorizontalDrag();
  useEffect(() => {
    const update = (event: KeyboardEvent) => setOverridePressed(event.ctrlKey && event.shiftKey);
    const clear = () => setOverridePressed(false);
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', update);
      window.removeEventListener('blur', clear);
    };
  }, []);
  const players = useMemo(() => runtime.players.filter((player) => {
    if (filter === 'nearby' && !player.nearby) return false;
    return player.username.toLowerCase().includes(query.trim().toLowerCase());
  }), [filter, query, runtime.players]);

  const runAction = async (player: PlayerPresence, actionId: string, overrideFriendProtection = false) => {
    try {
      const result = await window.mineprompt.playerAction({
        sessionId: runtime.selectedSessionId,
        username: player.username,
        actionId,
        overrideFriendProtection
      });
      if (result.prepareCommand) dispatch(consoleActions.commandPrepared(result.prepareCommand));
    } catch (error) {
      dispatch(consoleActions.entryReceived({
        level: 'error',
        message: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        sessionId: runtime.selectedSessionId
      }));
    }
  };

  const entries = menu?.player.actions.map<MenuEntry>((action) => {
    const overriding = action.relationshipProtected && action.overrideAllowed && overridePressed;
    return {
      id: action.id,
      label: overriding ? `${action.label} with override` : action.label,
      detail: action.detail?.replace('<name>', menu.player.username),
      enabled: action.enabled || overriding,
      reason: overriding ? 'Friend protection override is active.' : action.reason,
      danger: action.danger,
      run: () => runAction(menu.player, action.id, overriding)
    };
  }) || [];

  if (runtime.status === 'disconnected') return null;

  return (
    <section className="player-ribbon" aria-label="Online players">
      <div className="player-ribbon__controls">
        <div className="segmented-control" aria-label="Player filter">
          <button type="button" data-active={filter === 'nearby'} onClick={() => dispatch(uiActions.playerFilterChanged('nearby'))}>Nearby</button>
          <button type="button" data-active={filter === 'all'} onClick={() => dispatch(uiActions.playerFilterChanged('all'))}>All</button>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Filter players" aria-label="Filter players" />
        <span className="player-ribbon__count">{players.length} shown</span>
      </div>
      <div className="player-ribbon__list" {...scroll}>
        {players.map((player) => (
          <button
            type="button"
            className="player-chip"
            data-self={player.username === runtime.username}
            data-friend={player.friend}
            key={player.uuid || player.username}
            onClick={(event) => setMenu({ player, x: event.clientX, y: event.clientY })}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ player, x: event.clientX, y: event.clientY });
            }}
          >
            <img src={playerHead(player.username, runtime.externalPlayerHeadsEnabled)} alt="" />
            <span>
              <strong>{player.username}</strong>
              <small>{player.distance !== null ? `${player.distance} blocks` : player.ping !== null ? `${player.ping} ms` : 'Online'}</small>
            </span>
          </button>
        ))}
        {!players.length ? <p className="inline-empty">{runtime.status === 'online' ? 'No players match this filter.' : 'Connect a bot to view players.'}</p> : null}
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} title={menu.player.username} subtitle={menu.player.friend ? 'Friend' : menu.player.nearby ? 'Nearby player' : 'Online player'} entries={entries} close={() => setMenu(null)} /> : null}
    </section>
  );
}
