import { useEffect, useMemo, useState } from 'react';
import { shallowEqual } from 'react-redux';
import { configureItemTexture, playerHead } from '../../assets';
import { ContextMenu, type MenuEntry } from '../../components/ContextMenu';
import { useHorizontalDrag } from '../../components/useHorizontalDrag';
import { consoleActions, uiActions, useAppDispatch, useAppSelector } from '../../store';
import type { BlockTarget, EntityTarget, TargetActionDescriptor, TargetPosition } from '../../types';

type EntityFilter = 'all' | 'items' | 'mobs' | 'villagers';

const EMPTY_TARGETS = { cursorBlock: null, cursorEntity: null, entities: [] } as const;

type OpenMenu = {
  target: BlockTarget | EntityTarget;
  type: 'block' | 'entity';
  x: number;
  y: number;
};

function TargetImage({ target, externalHeads }: { target: BlockTarget | EntityTarget; externalHeads: boolean }) {
  if ('kind' in target && target.kind === 'player') return <img src={playerHead(target.username, externalHeads)} alt="" draggable={false} />;
  if ('kind' in target && !['item', 'villager'].includes(target.kind)) return <b className="target-avatar">{target.displayName.slice(0, 2).toUpperCase()}</b>;
  const texture = 'kind' in target && target.kind === 'villager' ? 'emerald' : target.name;
  return <img ref={(image) => configureItemTexture(image, texture)} alt="" draggable={false} />;
}

function filterEntity(entity: EntityTarget, filter: EntityFilter) {
  if (filter === 'all') return entity.kind !== 'player';
  if (filter === 'items') return entity.kind === 'item';
  if (filter === 'villagers') return entity.kind === 'villager';
  return entity.kind === 'mob' || entity.kind === 'entity';
}

export function TargetRibbon() {
  const dispatch = useAppDispatch();
  const runtime = useAppSelector((state) => ({
    selectedSessionId: state.runtime.selectedSessionId,
    status: state.runtime.state.status,
    targets: state.runtime.session.targets,
    miningPresets: state.runtime.miningPresets,
    activeMiningPresetId: state.runtime.activeMiningPresetId,
    activities: state.runtime.activities,
    externalPlayerHeadsEnabled: state.runtime.preferences.externalPlayerHeadsEnabled
  }), shallowEqual);
  const [filter, setFilter] = useState<EntityFilter>('all');
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [overridePressed, setOverridePressed] = useState(false);
  const [regionStart, setRegionStart] = useState<TargetPosition | null>(null);
  const scroll = useHorizontalDrag();
  const targets = runtime.targets || EMPTY_TARGETS;
  const cursorBlock = targets.cursorBlock;
  const cursorEntity = targets.cursorEntity;
  const entities = useMemo(() => targets.entities.filter((entity) => filterEntity(entity, filter)), [filter, targets.entities]);
  const activeMiningPreset = runtime.miningPresets.find((preset) => preset.id === runtime.activeMiningPresetId) || null;

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

  useEffect(() => setRegionStart(null), [runtime.selectedSessionId]);

  const runAction = async (target: BlockTarget | EntityTarget, type: 'block' | 'entity', action: TargetActionDescriptor, overriding = false) => {
    try {
      await window.mineprompt.targetAction({
        sessionId: runtime.selectedSessionId,
        actionId: action.id,
        ...(type === 'entity' ? { entityId: (target as EntityTarget).id } : { target: 'position', position: target.position }),
        ...(action.id === 'block.mine-depth' ? { depth: 4 } : {}),
        ...(action.id.startsWith('block.mine') || action.id === 'block.dig' ? { presetId: activeMiningPreset?.id || null } : {}),
        overrideFriendProtection: overriding
      });
    } catch (error) {
      dispatch(consoleActions.entryReceived({
        level: 'error',
        message: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        sessionId: runtime.selectedSessionId
      }));
    }
  };

  const runCommand = async (command: string) => {
    const result = await window.mineprompt.execute(command, runtime.selectedSessionId);
    if (!result.ok) {
      dispatch(consoleActions.entryReceived({
        level: 'error',
        message: result.error || 'The mining command could not be started.',
        timestamp: Date.now(),
        sessionId: runtime.selectedSessionId
      }));
    }
  };

  const entries = menu?.target.actions.map<MenuEntry>((action) => {
    const overriding = action.relationshipProtected && action.overrideAllowed && overridePressed;
    return {
      id: action.id,
      label: overriding ? `${action.label} with override` : activeMiningPreset && (action.id.startsWith('block.mine') || action.id === 'block.dig') ? `${action.label} with ${activeMiningPreset.name}` : action.label,
      detail: action.detail?.replace('<target>', menu.type === 'entity' ? String((menu.target as EntityTarget).id) : 'block'),
      enabled: action.enabled || overriding,
      reason: overriding ? 'Friend protection override is active.' : action.reason,
      danger: action.danger,
      run: () => runAction(menu.target, menu.type, action, overriding)
    };
  }) || [];

  if (menu?.type === 'block') {
    const block = menu.target as BlockTarget;
    const coordinates = (position: TargetPosition) => `${position.x} ${position.y} ${position.z}`;
    entries.push({ id: 'region-start', label: 'Set region start', run: () => setRegionStart(block.position) });
    if (regionStart) {
      const presetFlag = activeMiningPreset ? ` --preset ${JSON.stringify(activeMiningPreset.name)}` : '';
      const command = `mine region ${coordinates(regionStart)} ${coordinates(block.position)}${presetFlag}`;
      entries.push(
        { id: 'region-mine', label: activeMiningPreset ? `Mine selected region with ${activeMiningPreset.name}` : 'Mine selected region', danger: true, run: () => runCommand(command) },
        {
          id: 'region-advanced',
          label: 'Configure selected region',
          run: () => {
            dispatch(consoleActions.commandPrepared(`${command} `));
            dispatch(uiActions.terminalOpened());
          }
        }
      );
    }
    entries.push({ id: 'chunk-layer', label: activeMiningPreset ? `Mine current chunk layer with ${activeMiningPreset.name}` : 'Mine current chunk layer', danger: true, run: () => runCommand(`mine chunk 1${activeMiningPreset ? ` --preset ${JSON.stringify(activeMiningPreset.name)}` : ''}`) });
  }

  if (runtime.status === 'disconnected') return null;
  const open = (event: React.MouseEvent, target: BlockTarget | EntityTarget, type: 'block' | 'entity') => {
    event.preventDefault();
    setMenu({ target, type, x: event.clientX, y: event.clientY });
  };

  return (
    <section className="target-ribbon" aria-label="World targets">
      <div className="segmented-control target-ribbon__filters" aria-label="Entity filter">
        {(['all', 'items', 'mobs', 'villagers'] as const).map((value) => <button type="button" key={value} data-active={filter === value} onClick={() => setFilter(value)}>{value.charAt(0).toUpperCase() + value.slice(1)}</button>)}
      </div>
      <div className="target-ribbon__list" {...scroll}>
        {cursorBlock ? <button type="button" className="target-chip" data-cursor="true" onClick={(event) => open(event, cursorBlock, 'block')} onContextMenu={(event) => open(event, cursorBlock, 'block')}><TargetImage target={cursorBlock} externalHeads={runtime.externalPlayerHeadsEnabled} /><span><strong>{cursorBlock.displayName}</strong><small>Cursor block, {cursorBlock.distance} blocks</small></span></button> : null}
        {cursorEntity ? <button type="button" className="target-chip" data-cursor="true" title={cursorEntity.text || undefined} onClick={(event) => open(event, cursorEntity, 'entity')} onContextMenu={(event) => open(event, cursorEntity, 'entity')}><TargetImage target={cursorEntity} externalHeads={runtime.externalPlayerHeadsEnabled} /><span><strong>{cursorEntity.displayName}</strong><small>{cursorEntity.text || `Cursor entity, ${cursorEntity.distance} blocks`}</small></span></button> : null}
        {entities.map((entity) => <button type="button" className="target-chip" data-friend={entity.friend} title={entity.text || undefined} key={entity.id} onClick={(event) => open(event, entity, 'entity')} onContextMenu={(event) => open(event, entity, 'entity')}><TargetImage target={entity} externalHeads={runtime.externalPlayerHeadsEnabled} /><span><strong>{entity.displayName}{entity.count ? ` x${entity.count}` : ''}</strong><small>{entity.text || `${entity.kind}, ${entity.distance} blocks`}</small></span></button>)}
        {regionStart ? <button type="button" className="target-chip task-chip" onClick={() => setRegionStart(null)}><span><strong>Region start</strong><small>{regionStart.x}, {regionStart.y}, {regionStart.z}, click to clear</small></span></button> : null}
        {runtime.activities.map((activity) => <button type="button" className="target-chip task-chip" key={activity.id} onClick={() => void window.mineprompt.execute(`tasks stop ${activity.id}`, runtime.selectedSessionId)}><span><strong>{activity.label}</strong><small>{activity.detail || 'Running'}, click to stop</small></span></button>)}
        {!targets.cursorBlock && !targets.cursorEntity && !entities.length ? <p className="inline-empty">No targets in range.</p> : null}
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} title={menu.target.displayName} subtitle={menu.type === 'entity' ? `${(menu.target as EntityTarget).kind}, ${menu.target.distance} blocks` : `Cursor block, ${menu.target.distance} blocks`} entries={entries} close={() => setMenu(null)} /> : null}
    </section>
  );
}
