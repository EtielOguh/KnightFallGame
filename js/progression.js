import { AREAS, ENEMIES, ITEMS } from "./data.js";

export const BALANCE = Object.freeze({
  MAX_OFFLINE_SECONDS: 8 * 60 * 60,
  TRAINING_XP_PER_SECOND: 0.45,
  COMBAT_MASTERY_EFFICIENCY: 0.5,
  AUTO_FARM_MASTERY_EFFICIENCY: 0.4,
  AUTO_FARM_EFFICIENCY: 0.9,
  MASTERY_MAX_LEVEL: 100,
  MASTERY_DAMAGE_PER_LEVEL: 0.012,
  PLAYER_XP_BASE: 150,
  PLAYER_XP_EXPONENT: 1.7,
  ENEMY_XP_BASE: 10,
  ENEMY_XP_EXPONENT: 1.15,
  ENCOUNTER_DELAY: 3,
  NORMAL_EQUIPMENT_DROP_MULTIPLIER: 0.65,
  POTION_DROP_RATES: { pocao_menor: 0.06, pocao_maior: 0.015, pocao_suprema: 0.0025 },
  EQUIPMENT_RARITY_WEIGHTS: { comum: 0.68, incomum: 0.22, raro: 0.07, épico: 0.024, lendário: 0.0055, mítico: 0.0005 }
});

export const WEAPON_TYPES = Object.freeze({
  sword: { name: "Espada", attackInterval: 1.15, mainAttribute: "for" },
  axe: { name: "Machado", attackInterval: 1.55, mainAttribute: "for" },
  spear: { name: "Lança", attackInterval: 1.3, mainAttribute: "for" },
  bow: { name: "Arco", attackInterval: 1.35, mainAttribute: "des" },
  staff: { name: "Cajado", attackInterval: 1.5, mainAttribute: "int" },
  dagger: { name: "Adaga", attackInterval: 0.8, mainAttribute: "des" }
});

export const MASTERY_MILESTONES = Object.freeze([10, 25, 50, 75, 100]);

export function createWeaponMastery() {
  return Object.fromEntries(Object.keys(WEAPON_TYPES).map(type => [type, { level: 1, exp: 0, totalTrainingTime: 0 }]));
}

export function masteryExpRequired(level) { return Math.round(100 * Math.pow(level, 1.45)); }
export function playerExpRequired(level) { return Math.round(BALANCE.PLAYER_XP_BASE * Math.pow(level, BALANCE.PLAYER_XP_EXPONENT)); }
export function masteryDamageMultiplier(level) { return 1 + level * BALANCE.MASTERY_DAMAGE_PER_LEVEL; }

export function addMasteryExp(mastery, amount, trainingSeconds = 0) {
  const before = mastery.level;
  mastery.exp += Math.max(0, amount);
  mastery.totalTrainingTime += Math.max(0, trainingSeconds);
  while (mastery.level < BALANCE.MASTERY_MAX_LEVEL && mastery.exp >= masteryExpRequired(mastery.level)) {
    mastery.exp -= masteryExpRequired(mastery.level);
    mastery.level += 1;
  }
  if (mastery.level >= BALANCE.MASTERY_MAX_LEVEL) mastery.exp = 0;
  return { before, after: mastery.level, gained: amount };
}

export function calculateTraining(seconds) {
  const safeSeconds = Math.max(0, Math.min(seconds, BALANCE.MAX_OFFLINE_SECONDS));
  return { seconds: safeSeconds, exp: safeSeconds * BALANCE.TRAINING_XP_PER_SECOND };
}

export function sanitizedElapsedSeconds(startedAt, now = Date.now()) {
  const timestamp = Number(startedAt);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.min((now - timestamp) / 1000, BALANCE.MAX_OFFLINE_SECONDS));
}

export function enemyExperience(level, rank = "normal") {
  const multiplier = { normal: 1, strong: 1.4, elite: 2.5, boss: 8 }[rank] || 1;
  return Math.round(BALANCE.ENEMY_XP_BASE * Math.pow(level, BALANCE.ENEMY_XP_EXPONENT) * multiplier);
}

export function levelRewardMultiplier(enemyLevel, playerLevel) {
  return Math.max(0.1, Math.min(1.25, enemyLevel / Math.max(1, playerLevel)));
}

export function estimateAutoFarm(regionId, snapshot) {
  const area = AREAS[regionId];
  if (!area) throw new Error("Região inválida.");
  const level = Math.round((area.levels[0] + area.levels[1]) / 2);
  const templates = area.enemies.map(id => ENEMIES[id]);
  const enemyHp = average(templates.map(enemy => enemy.hp * (1 + (level - area.levels[0]) * .1)));
  const enemyAttack = average(templates.map(enemy => enemy.attack * (1 + (level - area.levels[0]) * .1)));
  const enemyDefense = average(templates.map(enemy => enemy.defense));
  const attackInterval = Math.max(.1, Number(snapshot.attackInterval) || 1);
  const hitChance = Math.max(.65, Math.min(.97, .88 + ((Number(snapshot.attributes?.des) || 1) - level) * .008));
  const critMultiplier = 1 + Math.min(.5, snapshot.crit / 100) * .6;
  const averageDamage = Math.max(1, (snapshot.attack - enemyDefense) * hitChance * critMultiplier);
  const hitsToKill = Math.max(1, Math.ceil(enemyHp / averageDamage));
  const killTime = Math.max(.5, hitsToKill * attackInterval);
  const cycleTime = (killTime + BALANCE.ENCOUNTER_DELAY) / BALANCE.AUTO_FARM_EFFICIENCY;
  const enemyAttacks = Math.max(1, Math.floor(killTime / 1.7));
  const damagePerKill = Math.max(1, enemyAttack - snapshot.defense) * enemyAttacks;
  const efficiency = Math.round(100 * BALANCE.AUTO_FARM_EFFICIENCY * hitChance * Math.min(1, snapshot.level / level));
  const expPerKill = Math.round(enemyExperience(level) * levelRewardMultiplier(level, snapshot.level));
  return {
    level, enemyHp, averageDamage, hitsToKill, killTime, cycleTime, damagePerKill, expPerKill,
    killsPerHour: Math.floor(3600 / cycleTime), efficiency: Math.max(10, Math.min(99, efficiency)),
    risk: damagePerKill < snapshot.maxHp * .18 ? "BAIXO" : damagePerKill < snapshot.maxHp * .4 ? "MÉDIO" : "ALTO"
  };
}

export function simulateAutoFarm(session, elapsedSeconds) {
  const seconds = Math.max(0, Math.min(elapsedSeconds, BALANCE.MAX_OFFLINE_SECONDS));
  const snapshot = structuredClone(session.playerSnapshot);
  snapshot.potions ??= {};
  snapshot.existingStacks ??= {};
  snapshot.attributes ??= { des: 1 };
  const estimate = estimateAutoFarm(session.regionId, snapshot);
  const area = AREAS[session.regionId];
  const result = {
    seconds: 0, kills: 0, exp: 0, coins: 0, drops: {}, potionsUsed: {},
    endingHp: snapshot.hp, died: false, stoppedReason: "tempo concluído", masterySeconds: 0
  };
  const potionInventory = { ...snapshot.potions };
  let occupiedSlots = snapshot.occupiedSlots;
  let time = 0;

  while (time + estimate.cycleTime <= seconds) {
    const enemyId = area.enemies[result.kills % area.enemies.length];
    const enemy = ENEMIES[enemyId];
    result.endingHp -= estimate.damagePerKill;
    time += estimate.cycleTime;

    if (result.endingHp <= 0) { result.died = true; result.stoppedReason = "derrota"; break; }

    if (snapshot.autoPotion && result.endingHp / snapshot.maxHp <= snapshot.potionThreshold) {
      const used = useSimulatedPotion(potionInventory, snapshot.preserveRarePotions);
      if (used) {
        result.endingHp = Math.min(snapshot.maxHp, result.endingHp + ITEMS[used].heal);
        result.potionsUsed[used] = (result.potionsUsed[used] || 0) + 1;
      }
    }
    if (snapshot.stopWithoutPotions && totalValues(potionInventory) <= 0 && result.endingHp < snapshot.maxHp * .35) {
      result.stoppedReason = "sem poções"; break;
    }

    result.kills += 1;
    result.exp += Math.round(enemyExperience(estimate.level) * levelRewardMultiplier(estimate.level, snapshot.level));
    result.coins += randomInt(enemy.coins[0], enemy.coins[1]);
    result.masterySeconds += estimate.killTime * BALANCE.AUTO_FARM_MASTERY_EFFICIENCY;

    for (const [itemId, baseChance] of enemy.drops) {
      const item = ITEMS[itemId];
      const chance = item.type === "equipment" ? baseChance * BALANCE.NORMAL_EQUIPMENT_DROP_MULTIPLIER : baseChance;
      if (Math.random() >= chance) continue;
      const needsSlot = item.type === "equipment" || !(itemId in result.drops) && !(itemId in snapshot.existingStacks);
      if (needsSlot && occupiedSlots >= snapshot.bagCapacity) {
        if (snapshot.stopWhenFull) { result.stoppedReason = "inventário cheio"; result.seconds = time; return result; }
        continue;
      }
      if (needsSlot) occupiedSlots += 1;
      result.drops[itemId] = (result.drops[itemId] || 0) + 1;
      if (item.type === "consumable") potionInventory[itemId] = (potionInventory[itemId] || 0) + 1;
    }

    for (const [potionId, chance] of Object.entries(BALANCE.POTION_DROP_RATES)) {
      if (Math.random() >= chance) continue;
      const needsSlot = !(potionId in snapshot.existingStacks) && !(potionId in result.drops);
      if (needsSlot && occupiedSlots >= snapshot.bagCapacity) {
        if (snapshot.stopWhenFull) { result.stoppedReason = "inventário cheio"; result.seconds = time; return result; }
        continue;
      }
      if (needsSlot) occupiedSlots += 1;
      result.drops[potionId] = (result.drops[potionId] || 0) + 1;
      potionInventory[potionId] = (potionInventory[potionId] || 0) + 1;
    }
  }
  result.seconds = time;
  return result;
}

export function formatDuration(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours ? `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m` : `${String(minutes).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
}

function useSimulatedPotion(inventory, preserveRare) {
  const order = preserveRare ? ["pocao_menor", "pocao_maior", "pocao_suprema"] : ["pocao_suprema", "pocao_maior", "pocao_menor"];
  const id = order.find(itemId => (inventory[itemId] || 0) > 0);
  if (id) inventory[id] -= 1;
  return id;
}

function average(values) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function totalValues(object) { return Object.values(object).reduce((sum, value) => sum + value, 0); }
function randomInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
