import type { Character } from "./types";

/** Reordena instâncias sem alterar seus estados, quantidades ou conteúdo. */
export function reorderInventoryItem(character: Character, id: string, targetId: string, side: "antes" | "depois"): Character {
  const items = character.inventario ?? [];
  const source = items.find(item => item.id === id);
  if (!source || id === targetId || !items.some(item => item.id === targetId)) return character;
  const next = items.filter(item => item.id !== id);
  const target = next.findIndex(item => item.id === targetId);
  next.splice(target + (side === "depois" ? 1 : 0), 0, source);
  if (next.every((item, index) => item === items[index])) return character;
  return { ...character, inventario: next };
}
