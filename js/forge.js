import { GAME_CONFIG, ITEMS } from "./data.js";
import {
  addInventoryItem, calculateItemStats, getInventoryEntry, inventoryCount,
  inventoryCapacity, inventoryUsed, removeInventoryItem
} from "./player.js";

const processedTransactions = new Set();
const transactionOrder = [];

export function getEnhancementCost(entry) {
  const item = ITEMS[entry?.definitionId];
  if (!entry || item?.type !== "equipment") return null;
  const currentLevel = normalizedLevel(entry.enhancementLevel);
  if (currentLevel >= GAME_CONFIG.forge.maxLevel) return null;
  const configured = GAME_CONFIG.forge.costs[currentLevel + 1];
  if (!configured) return null;
  return {
    targetLevel: currentLevel + 1,
    gold: configured.gold,
    materials: { ...configured.materials }
  };
}

export function getEnhancementPreview(entry) {
  const cost = getEnhancementCost(entry);
  if (!cost) return null;
  return {
    before: calculateItemStats(entry),
    after: calculateItemStats({ ...entry, enhancementLevel: cost.targetLevel }),
    cost
  };
}

export function canEnhanceEquipment(player, uid) {
  const entry = getInventoryEntry(player, uid);
  const item = ITEMS[entry?.definitionId];
  if (!entry || item?.type !== "equipment") return failure("invalid_item", "Selecione um equipamento válido.");
  const cost = getEnhancementCost(entry);
  if (!cost) return failure("max_level", `Este equipamento já está no nível máximo (+${GAME_CONFIG.forge.maxLevel}).`);
  if (player.coins < cost.gold) return failure("insufficient_gold", `Faltam ${cost.gold - player.coins} moedas.`, cost);
  const missing = Object.entries(cost.materials).filter(([definitionId, amount]) => inventoryCount(player, definitionId) < amount);
  if (missing.length) {
    const description = missing.map(([definitionId, amount]) => `${ITEMS[definitionId].name}: ${inventoryCount(player, definitionId)}/${amount}`).join(" · ");
    return failure("insufficient_materials", `Materiais insuficientes — ${description}.`, cost);
  }
  return { ok: true, entry, item, cost };
}

export function enhanceEquipment(player, uid, options = {}) {
  if (isDuplicate(options.transactionId)) return failure("duplicate_transaction", "Esta operação já foi processada.");
  const check = canEnhanceEquipment(player, uid);
  if (!check.ok) return check;
  const before = calculateItemStats(check.entry);
  for (const [definitionId, amount] of Object.entries(check.cost.materials)) {
    if (!removeInventoryItem(player, definitionId, amount)) return failure("invalid_state", "O inventário mudou durante o reforço.");
  }
  player.coins -= check.cost.gold;
  check.entry.enhancementLevel = check.cost.targetLevel;
  check.entry.isNew = false;
  markTransaction(options.transactionId);
  return {
    ok: true,
    uid,
    level: check.entry.enhancementLevel,
    spent: check.cost,
    before,
    after: calculateItemStats(check.entry)
  };
}

export function calculateSalePrice(entry) {
  const item = ITEMS[entry?.definitionId];
  if (!entry || item?.type !== "equipment") return 0;
  const level = normalizedLevel(entry.enhancementLevel);
  let investedValue = 0;
  for (let target = 1; target <= level; target += 1) {
    const cost = GAME_CONFIG.forge.costs[target];
    investedValue += cost.gold;
    for (const [definitionId, quantity] of Object.entries(cost.materials)) investedValue += ITEMS[definitionId].sellValue * quantity;
  }
  const salvage = GAME_CONFIG.economy.salvageByRarity?.[item.rarity];
  return Math.max(1, Math.floor((item.sellValue + investedValue * GAME_CONFIG.economy.enhancedSaleCostRatio) * (salvage?.goldMultiplier || 1)));
}

export function getSaleReturn(entry) {
  const item = ITEMS[entry?.definitionId];
  if (!entry || item?.type !== "equipment") return null;
  const configured = GAME_CONFIG.economy.salvageByRarity?.[item.rarity] || { materials: {} };
  const enhancementBonus = normalizedLevel(entry.enhancementLevel) >= 4 ? 1 : 0;
  const materials = Object.fromEntries(Object.entries(configured.materials || {}).map(([definitionId, quantity]) => [
    definitionId, Math.max(1, Math.floor(quantity + enhancementBonus))
  ]));
  return { gold: calculateSalePrice(entry), materials };
}

export function sellEquipment(player, uid, options = {}) {
  if (isDuplicate(options.transactionId)) return failure("duplicate_transaction", "Esta operação já foi processada.");
  const entry = getInventoryEntry(player, uid);
  const item = ITEMS[entry?.definitionId];
  if (!entry || item?.type !== "equipment") return failure("invalid_item", "Selecione um equipamento válido.");
  if (Object.values(player.equipment || {}).includes(uid)) return failure("equipped_item", "Desequipe o item antes de vendê-lo.");
  const index = player.inventory.findIndex(candidate => candidate.uid === uid);
  if (index < 0) return failure("invalid_state", "O item não está mais no inventário.");
  const saleReturn = getSaleReturn(entry);
  const materialIds = Object.keys(saleReturn.materials);
  const existingDefinitions = new Set(player.inventory.filter(candidate => candidate.uid !== uid).map(candidate => candidate.definitionId));
  const requiredSlots = materialIds.filter(definitionId => !existingDefinitions.has(definitionId)).length;
  if (player.inventory.length - 1 + requiredSlots > inventoryCapacity(player)) {
    return failure("inventory_full", "Libere espaço para receber os materiais da reciclagem.");
  }
  player.inventory.splice(index, 1);
  player.coins += saleReturn.gold;
  for (const [definitionId, quantity] of Object.entries(saleReturn.materials)) {
    if (!addInventoryItem(player, definitionId, quantity)) {
      player.coins -= saleReturn.gold;
      player.inventory.splice(index, 0, entry);
      return failure("invalid_state", "Não foi possível concluir a reciclagem.");
    }
  }
  markTransaction(options.transactionId);
  return { ok: true, uid, definitionId: entry.definitionId, price: saleReturn.gold, materials: saleReturn.materials };
}

export function purchaseEquipment(player, definitionId, options = {}) {
  if (isDuplicate(options.transactionId)) return failure("duplicate_transaction", "Esta operação já foi processada.");
  const item = ITEMS[definitionId];
  if (!item || item.type !== "equipment" || !GAME_CONFIG.economy.merchantEquipment.includes(definitionId)) {
    return failure("not_for_sale", "Este equipamento não está à venda.");
  }
  if (player.coins < item.buyPrice) return failure("insufficient_gold", `Faltam ${item.buyPrice - player.coins} moedas.`);
  if (inventoryUsed(player) >= inventoryCapacity(player)) return failure("inventory_full", "A mochila está cheia.");
  if (!addInventoryItem(player, definitionId, 1)) return failure("invalid_state", "Não foi possível adicionar o item.");
  player.coins -= item.buyPrice;
  markTransaction(options.transactionId);
  const entry = [...player.inventory].reverse().find(candidate => candidate.definitionId === definitionId);
  return { ok: true, definitionId, uid: entry?.uid || null, price: item.buyPrice };
}

function normalizedLevel(value) {
  const level = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(GAME_CONFIG.forge.maxLevel, level));
}

function failure(code, reason, cost = null) { return { ok: false, code, reason, ...(cost ? { cost } : {}) }; }
function isDuplicate(transactionId) { return Boolean(transactionId && processedTransactions.has(transactionId)); }
function markTransaction(transactionId) {
  if (!transactionId) return;
  processedTransactions.add(transactionId);
  transactionOrder.push(transactionId);
  if (transactionOrder.length > 256) processedTransactions.delete(transactionOrder.shift());
}
