import { formatDuration } from '../../../../packages/mineflayer-ui/index.js';
import { configureEffectTexture } from '../../assets';
import { TooltipTarget } from '../../components/TooltipTarget';
import { useAppSelector } from '../../store';

function level(value: number) {
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return numerals[value] || String(value + 1);
}

export function EffectPanel() {
  const effects = useAppSelector((root) => root.runtime.state.effects).filter((effect) => effect.showIcon !== false);
  if (!effects.length) return null;
  return (
    <aside className="effect-panel" aria-label="Active status effects">
      {effects.map((effect) => {
        const label = `${effect.displayName}${effect.amplifier > 0 ? ` ${level(effect.amplifier)}` : ''}`;
        return (
          <TooltipTarget key={`${effect.effect}:${effect.amplifier}`} className="effect-badge" label={`${label}, ${formatDuration(effect.duration)} remaining`} tooltip={<><strong>{label}</strong><span>{formatDuration(effect.duration)} remaining</span>{effect.ambient ? <small>Ambient effect</small> : null}</>}>
            <img className="effect-badge__frame" src={`img/faithful/gui/hud/effect_background${effect.ambient ? '_ambient' : ''}.png`} alt="" />
            <img className="effect-badge__icon" ref={(image) => configureEffectTexture(image, effect.effect)} alt="" />
          </TooltipTarget>
        );
      })}
    </aside>
  );
}
