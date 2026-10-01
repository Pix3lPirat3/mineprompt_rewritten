import { configureItemTexture } from '../../assets';
import type { ItemStack } from '../../types';

export function ItemIcon({ item, preview = false }: { item: ItemStack; preview?: boolean }) {
  const remaining = item.maxDurability ? Math.max(0, 1 - item.durabilityUsed / item.maxDurability) : 1;
  return (
    <span className={`item-icon${preview ? ' item-icon--preview' : ''}`}>
      <img ref={(image) => { if (image && !image.src) configureItemTexture(image, item.name); }} alt="" draggable={false} />
      {item.count > 1 ? <span className="inventory-slot__count">{item.count}</span> : null}
      {item.enchanted ? <span className="inventory-slot__glint" /> : null}
      {item.maxDurability > 0 && item.durabilityUsed > 0 ? (
        <span className="inventory-slot__durability" style={{ '--remaining': `${remaining * 100}%`, '--hue': Math.round(remaining * 120) } as React.CSSProperties} />
      ) : null}
    </span>
  );
}
