import { EQUIPMENT_SLOTS, GAME_CONFIG, ITEMS, SET_BONUSES } from "./data.js";
import { createWeaponMastery } from "./progression.js";
import { createPlayerResources, createSkillProgression, getPassiveStatModifiers, normalizeSkillProgression } from "./skills.js";

const ATTRIBUTE_KEYS = ["for", "des", "con", "int", "esp", "sor"];
const STAT_KEYS = ["maxHp", "attack", "armor", "crit", "moveSpeed"];
const EQUIPMENT_SLOT_KEYS = Object.keys(EQUIPMENT_SLOTS);

const ORIGINS = Object.freeze({
  1: { id: "mercenario", name: "Mercenário", description: "+2 FOR, +1 CON", bonuses: { for: 2, con: 1 } },
  2: { id: "cacador", name: "Caçador", description: "+2 DES, +1 SOR", bonuses: { des: 2, sor: 1 } },
  3: { id: "erudito", name: "Erudito", description: "+2 INT, +1 ESP", bonuses: { int: 2, esp: 1 } },
  4: { id: "exilado", name: "Exilado", description: "+1 em todos os atributos", bonuses: { for: 1, des: 1, con: 1, int: 1, esp: 1, sor: 1 } }
});

export function createPlayer(nameOrOptions = {}, originKey) {
  const options = typeof nameOrOptions === "string" ? { name: nameOrOptions, originKey } : nameOrOptions;
  const origin = ORIGINS[options.originKey] || null;
  const attributes = { ...GAME_CONFIG.player.baseAttributes };
  if (origin) for (const [key, amount] of Object.entries(origin.bonuses)) attributes[key] += amount;
  const position = GAME_CONFIG.player.startPosition;
  const inventory = GAME_CONFIG.player.startingInventory.map(item => createInventoryEntry(item.definitionId, item.quantity, { isNew: false }));
  const equipment = emptyEquipment();
  for (const [slot, definitionId] of Object.entries(GAME_CONFIG.player.startingEquipment || {})) {
    const entry = inventory.find(item => item.definitionId === definitionId && ITEMS[definitionId]?.slot === slot);
    if (entry) equipment[slot] = entry.uid;
  }

  return {
    id: options.id || createId("player"), name: cleanName(options.name),
    title: options.title || GAME_CONFIG.player.defaultTitle,
    originId: origin?.id || options.originId || "vale_cinzento",
    level: 1, xp: 0, hp: GAME_CONFIG.player.baseStats.maxHp,
    attributes, baseStats: { ...GAME_CONFIG.player.baseStats }, coins: GAME_CONFIG.player.startingCoins,
    inventory, equipment, skillProgression: createSkillProgression(), resources: createPlayerResources(), weaponMastery: createWeaponMastery(),
    progression: { kills: 0, upgrades: { attack: 0, armor: 0 } },
    bag: { capacity: GAME_CONFIG.player.inventoryCapacity, purchasedSlots: 0 },
    x: position.x, y: position.y, facing: position.dirX >= 0 ? 1 : -1, dirX: position.dirX, dirY: position.dirY
  };
}

export function normalizePlayer(raw = {}) {
  const defaults = createPlayer({ name: raw.name, title: raw.title, originId: raw.originId });
  const upgrades = {
    attack: toInt(raw.damageUpgrades, raw.progression?.upgrades?.attack ?? 0, 0, 100000),
    armor: toInt(raw.armorUpgrades, raw.progression?.upgrades?.armor ?? 0, 0, 100000)
  };
  const sourceAttributes = raw.attributes && typeof raw.attributes === "object" ? raw.attributes : {};
  const attributes = Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, finite(sourceAttributes[key], defaults.attributes[key], 0, 100000)]));
  const baseStats = {
    maxHp: finite(raw.baseStats?.maxHp, finite(raw.maxHp, defaults.baseStats.maxHp, 1, 100000000), 1, 100000000),
    attack: finite(raw.baseStats?.attack, finite(raw.damage ?? raw.attack, defaults.baseStats.attack, 0, 100000000), 0, 100000000),
    armor: finite(raw.baseStats?.armor, finite(raw.armor ?? raw.defense, defaults.baseStats.armor, 0, 100000000), 0, 100000000),
    crit: finite(raw.baseStats?.crit, raw.crit ?? 0, 0, 100),
    moveSpeed: finite(raw.baseStats?.moveSpeed, defaults.baseStats.moveSpeed, 20, 1000)
  };
  const inventory = normalizeInventory(raw.inventory, raw.potions);
  const equipment = normalizeEquipment(raw.equipment, inventory);
  const level = toInt(raw.level, 1, 1, 100000);
  const bag = {
    capacity: Math.max(inventory.length, toInt(raw.bag?.capacity, GAME_CONFIG.player.inventoryCapacity + finite(raw.bag?.purchasedSlots, 0), 1, 10000)),
    purchasedSlots: toInt(raw.bag?.purchasedSlots, 0, 0, 10000)
  };
  const stats = calculateStats({ ...defaults, level, attributes, baseStats, inventory, equipment, bag });
  return {
    ...defaults,
    id: typeof raw.id === "string" && raw.id ? raw.id : defaults.id,
    name: cleanName(raw.name), title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 80) : defaults.title,
    originId: typeof raw.originId === "string" && raw.originId ? raw.originId : defaults.originId,
    level, xp: finite(raw.xp, 0, 0, 1000000000000), hp: finite(raw.hp, stats.maxHp, 0, stats.maxHp),
    attributes, baseStats, coins: toInt(raw.coins, defaults.coins, 0, 1000000000000), inventory, equipment,
    skillProgression: normalizeSkillProgression(raw.skillProgression, raw.skills),
    resources: createPlayerResources(raw.resources), weaponMastery: normalizeMastery(raw.weaponMastery),
    progression: { kills: toInt(raw.progression?.kills, raw.kills ?? 0, 0, 1000000000000), upgrades }, bag,
    x: finite(raw.x, defaults.x, 0, 960), y: finite(raw.y, defaults.y, 0, 540),
    facing: finite(raw.facing, defaults.facing) < 0 ? -1 : 1,
    dirX: finite(raw.dirX, defaults.dirX, -1, 1), dirY: finite(raw.dirY, defaults.dirY, -1, 1)
  };
}

export function calculateStatBreakdown(player, temporaryModifiers = {}) {
  const base = {
    maxHp: finite(player.baseStats?.maxHp, GAME_CONFIG.player.baseStats.maxHp, 1),
    attack: finite(player.baseStats?.attack, GAME_CONFIG.player.baseStats.attack, 0),
    armor: finite(player.baseStats?.armor, GAME_CONFIG.player.baseStats.armor, 0),
    crit: finite(player.baseStats?.crit, 0, 0, 100),
    moveSpeed: finite(player.baseStats?.moveSpeed, GAME_CONFIG.player.baseStats.moveSpeed, 20)
  };
  const equipment = emptyStats();
  const passive = { ...emptyStats(), ...getPassiveStatModifiers(player) };
  const temporary = Object.fromEntries(STAT_KEYS.map(key => [key, finite(temporaryModifiers[key], 0)]));
  const equippedItems = Object.values(player.equipment || {}).map(uid => getInventoryEntry(player, uid)).filter(Boolean);
  for (const entry of equippedItems) addStats(equipment, calculateItemStats(entry));

  const setCounts = equippedItems.reduce((counts, entry) => {
    const setId = ITEMS[entry.definitionId]?.setId;
    if (setId) counts[setId] = (counts[setId] || 0) + 1;
    return counts;
  }, {});
  for (const [setId, count] of Object.entries(setCounts)) {
    if (count < 5 || !SET_BONUSES[setId]) continue;
    const bonus = SET_BONUSES[setId];
    addStats(equipment, { ...bonus, armor: bonus.armor ?? bonus.defense });
  }

  const total = Object.fromEntries(STAT_KEYS.map(key => {
    const value = base[key] + equipment[key] + passive[key] + temporary[key];
    const bounded = key === "crit" ? Math.max(0, Math.min(100, value)) : Math.max(key === "maxHp" ? 1 : 0, value);
    return [key, round(bounded)];
  }));
  return { base: roundStats(base), equipment: roundStats(equipment), passive: roundStats(passive), temporary: roundStats(temporary), total };
}

export function calculateStats(player, temporaryModifiers = {}) {
  return calculateStatBreakdown(player, temporaryModifiers).total;
}

export function calculateItemStats(entry) {
  const item = ITEMS[entry?.definitionId];
  if (!item || item.type !== "equipment") return emptyStats();
  const level = Math.max(0, toInt(entry.enhancementLevel, 0, 0, GAME_CONFIG.forge.maxLevel));
  const slotGrowth = GAME_CONFIG.forge.statGrowthBySlot[item.slot] || {};
  const result = emptyStats();
  for (const key of STAT_KEYS) {
    const base = finite(item.stats?.[key], 0);
    const growth = finite(slotGrowth[key], GAME_CONFIG.forge.defaultStatGrowth, 0);
    result[key] = round(base * (1 + level * growth));
  }
  return result;
}

export function inventoryCount(player, definitionId) {
  return player.inventory.filter(entry => entry.definitionId === definitionId).reduce((sum, entry) => sum + toInt(entry.quantity, 0, 0), 0);
}

export function inventoryUsed(player) { return Array.isArray(player.inventory) ? player.inventory.length : 0; }
export function inventoryCapacity(player) { return toInt(player.bag?.capacity, GAME_CONFIG.player.inventoryCapacity, 1, 10000); }
function isInventoryFull(player) { return inventoryUsed(player) >= inventoryCapacity(player); }
export function getInventoryEntry(player, uid) { return player.inventory?.find(entry => entry.uid === uid) || null; }
export function getEquippedEntry(player, slot) { return getInventoryEntry(player, player.equipment?.[slot]); }

export function addInventoryItem(player, definitionId, quantity = 1, options = {}) {
  const amount = toInt(quantity, 0, 0, 1000000000);
  const item = ITEMS[definitionId];
  if (!amount || !item) return false;
  if (item.type !== "equipment") {
    const stack = player.inventory.find(entry => entry.definitionId === definitionId);
    if (stack) { stack.quantity += amount; if (options.markNew !== false) stack.isNew = true; return true; }
    if (isInventoryFull(player)) return false;
    player.inventory.push(createInventoryEntry(definitionId, amount, { isNew: options.markNew !== false }));
    return true;
  }
  if (inventoryUsed(player) + amount > inventoryCapacity(player)) return false;
  for (let index = 0; index < amount; index += 1) player.inventory.push(createInventoryEntry(definitionId, 1, { isNew: options.markNew !== false }));
  return true;
}

export function removeInventoryItem(player, definitionId, quantity = 1) {
  let remaining = toInt(quantity, 0, 0, 1000000000);
  if (!remaining || inventoryCount(player, definitionId) < remaining) return false;
  const equipped = new Set(Object.values(player.equipment || {}).filter(Boolean));
  for (let index = player.inventory.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const entry = player.inventory[index];
    if (entry.definitionId !== definitionId || equipped.has(entry.uid)) continue;
    const removed = Math.min(entry.quantity, remaining);
    entry.quantity -= removed; remaining -= removed;
    if (entry.quantity <= 0) player.inventory.splice(index, 1);
  }
  return remaining === 0;
}

export function canEquipItem(player, uid) {
  const entry = getInventoryEntry(player, uid);
  const item = ITEMS[entry?.definitionId];
  if (!entry || !item || item.type !== "equipment" || !EQUIPMENT_SLOTS[item.slot]) return { ok: false, reason: "Este item não pode ser equipado." };
  if (player.level < item.requiredLevel) return { ok: false, reason: `Requer nível ${item.requiredLevel}.` };
  return { ok: true, slot: item.slot };
}

export function equipItem(player, uid) {
  const check = canEquipItem(player, uid);
  if (!check.ok) return check;
  player.equipment[check.slot] = uid;
  const entry = getInventoryEntry(player, uid);
  if (entry) entry.isNew = false;
  return { ok: true, slot: check.slot, uid };
}

export function unequipSlot(player, slot) {
  if (!EQUIPMENT_SLOTS[slot] || !player.equipment?.[slot]) return { ok: false, reason: "Nada equipado neste slot." };
  const uid = player.equipment[slot]; player.equipment[slot] = null;
  return { ok: true, slot, uid };
}

function normalizeInventory(rawInventory, visualPotionCount) {
  if (!Array.isArray(rawInventory)) {
    const count = toInt(visualPotionCount, GAME_CONFIG.player.startingInventory[0].quantity, 0, 1000000000);
    return count ? [createInventoryEntry("pocao_menor", count, { isNew: false })] : [];
  }
  return rawInventory.flatMap(entry => {
    if (!entry || typeof entry !== "object") return [];
    const definitionId = entry.definitionId || entry.itemId;
    const item = ITEMS[definitionId];
    if (!item) return [];
    return [{
      uid: typeof entry.uid === "string" && entry.uid ? entry.uid : createId("item"), definitionId,
      quantity: item.type === "equipment" ? 1 : toInt(entry.quantity, 1, 1, 1000000000),
      enhancementLevel: item.type === "equipment" ? toInt(entry.enhancementLevel, Math.max(0, toInt(entry.level, 1) - 1), 0, GAME_CONFIG.forge.maxLevel) : 0,
      isNew: Boolean(entry.isNew)
    }];
  });
}

function normalizeEquipment(raw, inventory) {
  const equipment = emptyEquipment();
  const legacy = raw && typeof raw === "object" ? raw : {};
  const candidates = { ...legacy, chest: legacy.chest ?? legacy.armor, amulet: legacy.amulet ?? legacy.charm };
  const used = new Set();
  for (const slot of EQUIPMENT_SLOT_KEYS) {
    const candidate = candidates[slot] ?? ((slot === "ring" || slot === "amulet") ? legacy.charm : null);
    const storedValue = typeof candidate === "string" ? candidate : null;
    const entry = inventory.find(item => item.uid === storedValue || item.definitionId === storedValue);
    if (entry && ITEMS[entry.definitionId]?.slot === slot && !used.has(entry.uid)) {
      equipment[slot] = entry.uid; used.add(entry.uid);
    }
  }
  return equipment;
}

function normalizeMastery(raw) {
  const defaults = createWeaponMastery();
  for (const [type, fallback] of Object.entries(defaults)) {
    const mastery = raw?.[type];
    defaults[type] = { level: toInt(mastery?.level, fallback.level, 1, 100), exp: finite(mastery?.exp, fallback.exp, 0, 1e12) };
  }
  return defaults;
}

function emptyEquipment() { return Object.fromEntries(EQUIPMENT_SLOT_KEYS.map(slot => [slot, null])); }
function emptyStats() { return Object.fromEntries(STAT_KEYS.map(key => [key, 0])); }
function addStats(target, source = {}) { for (const key of STAT_KEYS) target[key] += finite(source[key], 0); }
function roundStats(stats) { return Object.fromEntries(STAT_KEYS.map(key => [key, round(stats[key])])); }
function round(value) { return Math.round(finite(value, 0) * 100) / 100; }

function createInventoryEntry(definitionId, quantity = 1, options = {}) {
  const item = ITEMS[definitionId];
  return { uid: createId("item"), definitionId, quantity: item?.type === "equipment" ? 1 : quantity,
    enhancementLevel: item?.type === "equipment" ? toInt(options.enhancementLevel, 0, 0, GAME_CONFIG.forge.maxLevel) : 0, isNew: Boolean(options.isNew) };
}

function createId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}
function cleanName(name) { const value = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : ""; return (value || GAME_CONFIG.player.defaultName).slice(0, 32); }
function normalizeStringArray(value, fallback) { return Array.isArray(value) ? [...new Set(value.filter(item => typeof item === "string" && item))].slice(0, 1000) : [...fallback]; }
function finite(value, fallback, min = -Infinity, max = Infinity) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback; }
function toInt(value, fallback, min = -Infinity, max = Infinity) { return Math.floor(finite(value, fallback, min, max)); }
