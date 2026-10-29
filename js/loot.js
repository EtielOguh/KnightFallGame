import { ITEMS } from "./data.js";

/**
 * Pure loot roll: materials and consumables keep independent rolls, while
 * equipment shares a single channel and can yield at most one piece per kill.
 */
export function rollLoot(table, enemyLevel = 1, random = Math.random) {
  if (!Array.isArray(table)) return [];
  const eligible = table.filter(entry => {
    const definitionId = entry?.definitionId;
    const chance = Number(entry?.chance);
    const minimumEnemyLevel = Math.max(1, Math.floor(Number(entry?.minimumEnemyLevel) || 1));
    return Boolean(ITEMS[definitionId] && Number.isFinite(chance) && chance > 0 && enemyLevel >= minimumEnemyLevel);
  });
  const equipment = eligible.filter(entry => ITEMS[entry.definitionId].type === "equipment");
  const otherDrops = eligible.filter(entry => ITEMS[entry.definitionId].type !== "equipment").flatMap(entry => (
    random() < Math.min(1, Number(entry.chance)) ? [toDrop(entry)] : []
  ));
  if (!equipment.length) return otherDrops;

  const totalChance = equipment.reduce((sum, entry) => sum + Number(entry.chance), 0);
  if (random() >= Math.min(1, totalChance)) return otherDrops;
  let cursor = random() * totalChance;
  const selected = equipment.find(entry => {
    cursor -= Number(entry.chance);
    return cursor <= 0;
  }) || equipment[equipment.length - 1];
  return [...otherDrops, toDrop(selected)];
}

function toDrop(entry) {
  return { definitionId: entry.definitionId, quantity: Math.max(1, Math.floor(Number(entry.quantity) || 1)) };
}
