import { foodSprite, heartSprite, type FillState, type HeartStyle } from '../../../../packages/mineflayer-ui/index.js';
import { TooltipTarget } from '../../components/TooltipTarget';
import { useAppSelector } from '../../store';

function fillAt(value: number, index: number): FillState {
  const remaining = value - index * 2;
  return remaining >= 2 ? 'full' : remaining >= 1 ? 'half' : 'empty';
}

function FilledIconRow({ label, value, count = 10, source }: { label: string; value: number; count?: number; source(fill: FillState, index: number): string }) {
  return (
    <TooltipTarget className="hud-tooltip-target" label={label} tooltip={label}>
      <span className="vital-row">
        {Array.from({ length: count }, (_, index) => <img key={index} src={source(fillAt(value, index), index)} alt="" />)}
      </span>
    </TooltipTarget>
  );
}

export function PlayerHud() {
  const state = useAppSelector((root) => root.runtime.state);
  const presentation = useAppSelector((root) => root.runtime.session.presentation);
  const hud = presentation.hud;
  const effects = new Set(state.effects.map((effect) => effect.effect));
  const health = hud.health || state.health;
  const maximumHealth = Math.max(1, hud.maxHealth || 20);
  const armor = hud.armor || state.armor;
  const food = hud.food || state.hunger;
  const saturation = hud.saturation || state.saturation;
  const experience = hud.experience.level || hud.experience.points || hud.experience.progress ? hud.experience : state.experience;
  const heartStyle: HeartStyle = effects.has('wither') ? 'withered' : effects.has('poison') ? 'poisoned' : effects.has('freezing') ? 'frozen' : 'normal';
  const heartCount = Math.max(10, Math.min(20, Math.ceil(maximumHealth / 2)));
  const hungry = effects.has('hunger');
  const progress = Math.max(0, Math.min(1, experience.progress || 0));

  return (
    <div className="player-hud">
      {armor > 0 ? <FilledIconRow label={`armor ${armor} of 20${hud.armorToughness ? `, ${hud.armorToughness} toughness` : ''}`} value={armor} source={(fill) => `img/faithful/gui/armor_${fill}.png`} /> : null}
      <div className="player-hud__survival">
        <FilledIconRow label={`health ${health} of ${maximumHealth}${hud.absorption ? `, ${hud.absorption} absorption` : ''}`} value={health} count={heartCount} source={(fill) => `img/faithful/gui/heart/${heartSprite(heartStyle, fill, hud.hardcore)}.png`} />
        <FilledIconRow label={`food ${food} of 20, ${saturation} saturation`} value={food} source={(fill) => `img/faithful/gui/food_${foodSprite(fill, hungry)}.png`} />
        {hud.absorption > 0 ? <FilledIconRow label={`absorption ${hud.absorption}`} value={hud.absorption} count={Math.ceil(hud.absorption / 2)} source={(fill) => `img/faithful/gui/heart/${heartSprite('absorbing', fill, hud.hardcore)}.png`} /> : null}
        {hud.oxygen < 20 ? <FilledIconRow label={`air ${hud.oxygen} of 20`} value={hud.oxygen} source={(fill) => `img/faithful/gui/hud/${fill === 'empty' ? 'air_empty' : fill === 'half' ? 'air_bursting' : 'air'}.png`} /> : null}
      </div>
      <TooltipTarget className="experience-bar" label={`Experience level ${experience.level}`} tooltip={`Level ${experience.level} | ${experience.points} total points | ${Math.round(progress * 100)} percent to next level`}>
        <span className="experience-bar__track"><i style={{ width: `${progress * 100}%` }} /></span>
        <strong>{Math.max(0, Math.floor(experience.level || 0))}</strong>
      </TooltipTarget>
      {presentation.vehicle?.maxHealth ? (
        <FilledIconRow
          label={`${presentation.vehicle.displayName}: ${presentation.vehicle.health} of ${presentation.vehicle.maxHealth} health`}
          value={presentation.vehicle.health || 0}
          count={Math.min(15, Math.ceil(presentation.vehicle.maxHealth / 2))}
          source={(fill) => `img/faithful/gui/heart/${heartSprite('vehicle', fill)}.png`}
        />
      ) : null}
    </div>
  );
}
