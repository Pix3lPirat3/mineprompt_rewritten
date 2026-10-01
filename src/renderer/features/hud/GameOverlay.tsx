import { useAppSelector } from '../../store';

function BossBar({ title, color, progress, dividers }: { title: string; color: string; progress: number; dividers: number }) {
  const base = `img/faithful/gui/boss_bar/${color}`;
  const width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  return (
    <div className="boss-bar" aria-label={`${title}, ${Math.round(progress * 100)} percent`}>
      <strong>{title}</strong>
      <span className="boss-bar__track">
        <img src={`${base}_background.png`} alt="" />
        <i style={{ width }}><img src={`${base}_progress.png`} alt="" /></i>
        {dividers ? <img className="boss-bar__notches" src={`img/faithful/gui/boss_bar/notched_${dividers}_background.png`} alt="" /> : null}
        {dividers ? <i className="boss-bar__notch-progress" style={{ width }}><img src={`img/faithful/gui/boss_bar/notched_${dividers}_progress.png`} alt="" /></i> : null}
      </span>
    </div>
  );
}

export function GameOverlay() {
  const presentation = useAppSelector((root) => root.runtime.session.presentation);
  const online = useAppSelector((root) => root.runtime.state.status === 'online');
  if (!online) return null;
  const candidate = presentation.scoreboard;
  const board = candidate && (candidate.title.trim() || candidate.items.length) ? candidate : null;
  return (
    <div className="game-overlay" aria-live="polite">
      {presentation.bossBars.length ? <div className="boss-bar-stack">{presentation.bossBars.map((bar) => <BossBar key={bar.id} {...bar} />)}</div> : null}
      {board ? <aside className="scoreboard"><strong>{board.title}</strong>{board.items.map((item) => <span key={`${item.name}:${item.value}`}><b>{item.displayName}</b><i>{item.value}</i></span>)}</aside> : null}
      {presentation.overlay.title || presentation.overlay.subtitle ? <div className="title-overlay"><strong>{presentation.overlay.title}</strong><span>{presentation.overlay.subtitle}</span></div> : null}
      {presentation.overlay.actionBar ? <div className="action-bar">{presentation.overlay.actionBar}</div> : null}
    </div>
  );
}
