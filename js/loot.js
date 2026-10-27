import { ITEMS } from "./data.js";

/** Pure loot roll: the caller decides how rewards enter the inventory. */
export function rollLoot(table, enemyLevel = 1, random = Math.random) {
  if (!Array.isArray(table)) return [];
  return table.flatMap(entry => {
    const definitionId = entry?.definitionId;
    const chance = Number(entry?.chance);
    const minimumEnemyLevel = Math.max(1, Math.floor(Number(entry?.minimumEnemyLevel) || 1));
    if (!ITEMS[definitionId] || !Number.isFinite(chance) || chance <= 0 || enemyLevel < minimumEnemyLevel) return [];
    return random() < Math.min(1, chance) ? [{ definitionId, quantity: Math.max(1, Math.floor(Number(entry.quantity) || 1)) }] : [];
  });
}
