import { useEffect, useMemo, useState } from 'react';
import { configureItemTexture } from '../../assets';
import { useAppSelector } from '../../store';
import type { ContainerLayout, InventoryRequest, ItemStack, RecipeDescriptor } from '../../types';

interface WorkstationControlsProps {
  layout: ContainerLayout;
  request(details: Pick<InventoryRequest, 'scope' | 'action'> & Record<string, unknown>): Promise<void>;
}

function ItemImage({ name }: { name: string }) {
  return <img ref={(image) => {
    if (image && !image.src) configureItemTexture(image, name);
  }} alt="" />;
}

function ItemPicker({ label, value, items, change }: { label: string; value: string; items: ItemStack[]; change(value: string): void }) {
  return (
    <label><span>{label}</span><select value={value} onChange={(event) => change(event.target.value)}>
      <option value="">Choose an item</option>
      {items.map((item) => <option key={item.slot} value={String(item.slot)}>{item.displayName} x {item.count}</option>)}
    </select></label>
  );
}

function FurnaceProgress({ progress, fuel }: { progress: number | null; fuel: number | null }) {
  const cooking = Math.max(0, Math.min(1, Number(progress) || 0));
  const burning = Math.max(0, Math.min(1, Number(fuel) || 0));
  return (
    <div className="furnace-progress" aria-label={`Cooking ${Math.round(cooking * 100)} percent, fuel ${Math.round(burning * 100)} percent`}>
      <span className="furnace-progress__flame"><img src="img/faithful/gui/workstation/furnace_lit.png" style={{ clipPath: `inset(${(1 - burning) * 100}% 0 0)` }} alt="" /></span>
      <span className="furnace-progress__arrow"><img src="img/faithful/gui/workstation/furnace_burn.png" style={{ clipPath: `inset(0 ${(1 - cooking) * 100}% 0 0)` }} alt="" /></span>
      <small>{Math.round(cooking * 100)}%</small>
    </div>
  );
}

function BrewingProgress({ properties }: { properties: Record<string, number> }) {
  const brewTime = Math.max(0, Number(properties.brewTime ?? properties.brew_time) || 0);
  const fuel = Math.max(0, Math.min(20, Number(properties.fuel) || 0));
  const progress = brewTime > 0 ? Math.max(0, Math.min(1, 1 - brewTime / 400)) : 0;
  return (
    <div className="brewing-progress" aria-label={`Brewing ${Math.round(progress * 100)} percent, fuel ${fuel} of 20`}>
      <span className="brewing-progress__bubbles"><img src="img/faithful/gui/workstation/brewing_bubbles.png" alt="" /></span>
      <span className="brewing-progress__bar"><img src="img/faithful/gui/workstation/brewing_progress.png" style={{ clipPath: `inset(0 0 ${(1 - progress) * 100}% 0)` }} alt="" /></span>
      <span className="brewing-progress__fuel"><img src="img/faithful/gui/workstation/brewing_fuel.png" style={{ clipPath: `inset(0 ${(1 - fuel / 20) * 100}% 0 0)` }} alt="" /></span>
    </div>
  );
}

export function WorkstationControls({ layout, request }: WorkstationControlsProps) {
  const runtime = useAppSelector((state) => state.runtime);
  const items = runtime.session.inventory;
  const [query, setQuery] = useState('');
  const [recipes, setRecipes] = useState<RecipeDescriptor[]>([]);
  const [loading, setLoading] = useState(false);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [fuel, setFuel] = useState('');
  const [name, setName] = useState('');
  const [tradeCount, setTradeCount] = useState(1);
  const itemOptions = useMemo(() => items.filter((item) => item.slot >= 9 && item.slot <= 44), [items]);
  const visibleTrades = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return layout.trades;
    return layout.trades.filter((trade) => [trade.firstInput, trade.secondInput, trade.output].some((item) => item && `${item.displayName} ${item.name}`.toLowerCase().includes(normalized)));
  }, [layout.trades, query]);

  useEffect(() => {
    if (!layout.capabilities.recipes) return;
    let current = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void window.mineprompt.recipes({ sessionId: runtime.selectedSessionId, query, craftableOnly: true, maximum: 80 }).then((values) => {
        if (current) setRecipes(values);
      }).finally(() => {
        if (current) setLoading(false);
      });
    }, 120);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [layout.capabilities.recipes, query, runtime.selectedSessionId]);

  if (layout.capabilities.trades) {
    return (
      <div className="trade-browser">
        <div className="trade-toolbar"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter trades" /><label><span>Times</span><select value={tradeCount} onChange={(event) => setTradeCount(Number(event.target.value))}><option value={1}>1</option><option value={5}>5</option><option value={16}>16</option><option value={64}>64</option></select></label></div>
        <div className="trade-list">
        {visibleTrades.map((trade) => (
          <button key={trade.index} type="button" disabled={trade.disabled} onClick={() => void request({ scope: 'container', action: 'trade', tradeIndex: trade.index, count: tradeCount })}>
            <span className="trade-item">{trade.firstInput ? <ItemImage name={trade.firstInput.name} /> : null}<small>{trade.realPrice || trade.firstInput?.count}</small></span>
            {trade.secondInput ? <span className="trade-item"><ItemImage name={trade.secondInput.name} /><small>{trade.secondInput.count}</small></span> : null}
            <span className="trade-arrow">&gt;</span>
            <span className="trade-item result">{trade.output ? <ItemImage name={trade.output.name} /> : null}<small>{trade.output?.count}</small></span>
            <span className="trade-uses">{trade.uses}/{trade.maximumUses}</span>
          </button>
        ))}
        {!layout.trades.length ? <p>Waiting for villager offers.</p> : null}
        {layout.trades.length && !visibleTrades.length ? <p>No trades match this filter.</p> : null}
        </div>
      </div>
    );
  }

  if (layout.capabilities.recipes) {
    return (
      <div className="recipe-browser">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter craftable recipes" />
        <div>
          {recipes.map((recipe) => (
            <button key={recipe.id} type="button" disabled={!recipe.available} title={recipe.ingredients.map((item) => `${item.count} x ${item.displayName}`).join(', ')} onClick={() => void window.mineprompt.craft({ sessionId: runtime.selectedSessionId, connectionId: runtime.session.connectionId, recipeId: recipe.id, item: recipe.name, count: 1 })}>
              <ItemImage name={recipe.name} />
              <span><strong>{recipe.displayName}</strong><small>{recipe.resultCount} per craft</small></span>
            </button>
          ))}
          {!loading && !recipes.length ? <p>No available recipes.</p> : null}
          {loading ? <p>Loading recipes.</p> : null}
        </div>
      </div>
    );
  }

  if (layout.kind === 'furnace') {
    return (
      <div className="station-controls">
        <FurnaceProgress progress={layout.workstation.progress} fuel={layout.workstation.fuel} />
        <div className="station-actions">
          <ItemPicker label="Input" value={first} items={itemOptions} change={setFirst} />
          <button type="button" disabled={!first} onClick={() => void request({ scope: 'container', action: 'workstation', operation: 'put-input', target: first })}>Load input</button>
          <button type="button" onClick={() => void request({ scope: 'container', action: 'workstation', operation: 'take-input' })}>Take input</button>
          <ItemPicker label="Fuel" value={fuel} items={itemOptions} change={setFuel} />
          <button type="button" disabled={!fuel} onClick={() => void request({ scope: 'container', action: 'workstation', operation: 'put-fuel', target: fuel })}>Load fuel</button>
          <button type="button" onClick={() => void request({ scope: 'container', action: 'workstation', operation: 'take-fuel' })}>Take fuel</button>
          <button className="primary" type="button" onClick={() => void request({ scope: 'container', action: 'workstation', operation: 'take-output' })}>Collect output</button>
        </div>
      </div>
    );
  }

  if (layout.kind === 'brewing') {
    return (
      <div className="station-controls">
        <BrewingProgress properties={layout.properties} />
        <div className="station-guidance"><span>Drag bottles, ingredients, and fuel into their labeled slots. Brewing state updates live from the server.</span></div>
      </div>
    );
  }

  if (layout.kind === 'enchanting') {
    return (
      <div className="station-controls">
        <div className="station-actions station-actions--compact">
          <ItemPicker label="Target item" value={first} items={itemOptions} change={setFirst} />
          <button type="button" disabled={!first} onClick={() => void request({ scope: 'container', action: 'workstation', operation: 'put-target', target: first })}>Place item</button>
          <ItemPicker label="Lapis" value={second} items={itemOptions.filter((item) => item.name === 'lapis_lazuli')} change={setSecond} />
          <button type="button" disabled={!second} onClick={() => void request({ scope: 'container', action: 'workstation', operation: 'put-lapis', target: second })}>Place lapis</button>
          <button type="button" onClick={() => void request({ scope: 'container', action: 'workstation', operation: 'take-target' })}>Take item</button>
        </div>
        <div className="enchantment-choices">
          {layout.workstation.enchantments.map((enchantment) => <button key={enchantment.index} type="button" disabled={!enchantment.available} onClick={() => void request({ scope: 'container', action: 'workstation', operation: 'enchant', choice: enchantment.index })}><strong>Choice {enchantment.index + 1}</strong><span>Level {enchantment.level}</span></button>)}
          {!layout.workstation.enchantments.length ? <p>Place an item and lapis to load enchanting choices.</p> : null}
        </div>
      </div>
    );
  }

  if (layout.kind === 'anvil') {
    return (
      <div className="station-controls station-actions">
        <ItemPicker label="First item" value={first} items={itemOptions} change={setFirst} />
        <ItemPicker label="Second item" value={second} items={itemOptions.filter((item) => String(item.slot) !== first)} change={setSecond} />
        <label><span>Result name</span><input value={name} maxLength={35} onChange={(event) => setName(event.target.value)} placeholder="Optional for combine" /></label>
        <button className="primary" type="button" disabled={!first || !second} onClick={() => void request({ scope: 'container', action: 'workstation', operation: 'combine', first, second, name })}>Combine</button>
        <button type="button" disabled={!first || !name.trim()} onClick={() => void request({ scope: 'container', action: 'workstation', operation: 'rename', target: first, name })}>Rename</button>
      </div>
    );
  }

  if (layout.capabilities.operations.includes('move-items')) {
    return <div className="station-guidance"><strong>{layout.title} controls</strong><span>Drag items into the labeled slots or use Minecraft transfer gestures. Output and progress update live from the server.</span></div>;
  }

  return null;
}
