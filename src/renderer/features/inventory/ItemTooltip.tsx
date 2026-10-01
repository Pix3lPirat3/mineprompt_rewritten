import type { RefObject } from 'react';
import { HoverTooltip, type TooltipPoint } from '../../components/HoverTooltip';
import type { ItemStack } from '../../types';

function level(value: number) {
  const numerals: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X' };
  return numerals[value] || String(value);
}

function FormattedText({ html, text }: { html: string | null | undefined; text: string }) {
  return html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span>{text}</span>;
}

export function ItemTooltip({ anchor, item, point = null, visible, advanced = false }: { anchor: RefObject<HTMLElement | null>; item: ItemStack; point?: TooltipPoint | null; visible: boolean; advanced?: boolean }) {
  const loreHtml = item.loreHtml || [];
  const componentDetails = item.componentDetails || [];
  const dataTags = item.dataTags || [];
  const hiddenComponents = new Set(item.tooltipDisplay?.hiddenComponents || []);

  return (
    <HoverTooltip anchor={anchor} point={point} visible={visible} className="item-tooltip">
      <strong className="item-tooltip__name"><FormattedText html={item.displayNameHtml} text={item.displayName} /></strong>
      {!hiddenComponents.has('enchantments') ? item.enchantments.map((enchantment) => <span className="item-tooltip__enchantment" key={`${enchantment.name}:${enchantment.level}`}>{enchantment.displayName} {level(enchantment.level)}</span>) : null}
      {!hiddenComponents.has('lore') ? item.lore.map((line, index) => <span className="item-tooltip__lore" key={`${index}:${line}`}><FormattedText html={loreHtml[index]} text={line} /></span>) : null}
      {item.maxDurability > 0 && !hiddenComponents.has('damage') ? <span>Durability: {item.durabilityRemaining} / {item.maxDurability}</span> : null}
      {item.repairCost > 0 && !hiddenComponents.has('repair_cost') ? <span>Repair cost: {item.repairCost}</span> : null}
      {advanced && item.customModel !== null && !hiddenComponents.has('custom_model_data') ? <span>Custom model: {item.customModel}</span> : null}
      {advanced ? componentDetails.map((component) => <span className="item-tooltip__data" key={component.name}><b>{component.displayName}:</b> {component.value}</span>) : null}
      {advanced ? dataTags.map((tag) => <span className="item-tooltip__data" key={tag.name}><b>{tag.name}:</b> {tag.value}</span>) : null}
      {advanced ? <span className="item-tooltip__technical">minecraft:{item.name}</span> : null}
      {advanced ? <span className="item-tooltip__technical">Slot {item.slot} | Count {item.count} / {item.stackSize} | Metadata {item.metadata}</span> : null}
      {!advanced && (componentDetails.length > 0 || dataTags.length > 0) ? <span className="item-tooltip__hint">Hold Alt for advanced data</span> : null}
    </HoverTooltip>
  );
}
