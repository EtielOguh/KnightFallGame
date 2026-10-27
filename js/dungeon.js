import { GAME_CONFIG } from "./data.js";
import { rollLoot } from "./loot.js";

export const ENEMY_STATES = Object.freeze({
  PATROL: "patrol",
  CHASE: "chase",
  TELEGRAPH: "telegraph",
  ATTACK: "attack",
  RECOVER: "recover",
  HURT: "hurt",
  DYING: "dying"
});

export function createCaveProgress(raw = {}, legacyKills = 0) {
  return createRegionProgress(raw, GAME_CONFIG.firstCave, legacyKills);
}

export function getRegionConfig(regionId) {
  const definition = GAME_CONFIG.regions[regionId];
  const config = definition?.configKey ? GAME_CONFIG[definition.configKey] : null;
  if (!definition || !config) throw new RangeError(`Região jogável desconhecida: ${regionId}.`);
  return config;
}

export function createRegionProgress(raw = {}, config = GAME_CONFIG.firstCave, legacyKills = 0) {
  const total = config.totalFloors;
  const legacyFloor = Math.max(1, Math.min(total, Math.floor(Number(legacyKills) || 0) + 1));
  const highestUnlockedFloor = integer(raw.highestUnlockedFloor, legacyFloor, 1, total);
  const current = raw.currentExpeditionFloor == null ? null : integer(raw.currentExpeditionFloor, null, 1, highestUnlockedFloor);
  return {
    highestUnlockedFloor,
    currentExpeditionFloor: current,
    floorCompletions: numberRecord(raw.floorCompletions, total),
    bossVictories: integer(raw.bossVictories, 0, 0, 1000000),
    uniqueRewardsClaimed: {
      ...booleanRecord(raw.uniqueRewardsClaimed),
      ...(config.id === "caverna_sombria" ? { goblinKingFirstVictory: Boolean(raw.uniqueRewardsClaimed?.goblinKingFirstVictory) } : {})
    }
  };
}

export function createRegionProgressMap(raw = {}, legacyCave = {}, legacyKills = 0) {
  return Object.fromEntries(Object.entries(GAME_CONFIG.regions).flatMap(([id, definition]) => {
    if (definition.status !== "playable") return [];
    const config = getRegionConfig(id);
    const source = raw[id] || (id === "caverna_sombria" ? legacyCave : {});
    return [[id, createRegionProgress(source, config, id === "caverna_sombria" ? legacyKills : 0)]];
  }));
}

export function regionUnlockStatus(world, regionId) {
  const definition = GAME_CONFIG.regions[regionId];
  if (!definition) return { unlocked: false, reason: "Região desconhecida." };
  if (definition.status !== "playable") return { unlocked: false, reason: "Região ainda não disponível." };
  const rule = definition.unlock;
  if (!rule || rule.type === "always") return { unlocked: true, reason: "" };
  if (rule.type === "boss") {
    const unlocked = (world.bossesDefeated?.[rule.bossId] || 0) > 0;
    return { unlocked, reason: unlocked ? "" : rule.label || "Chefe anterior não derrotado." };
  }
  if (rule.type === "regionBoss") {
    const unlocked = (world.regionProgress?.[rule.regionId]?.bossVictories || 0) > 0;
    return { unlocked, reason: unlocked ? "" : "Derrote o chefe da região anterior." };
  }
  return { unlocked: false, reason: "Requisito desconhecido." };
}

export function getCaveTier(floor, config = GAME_CONFIG.firstCave) {
  const normalizedFloor = integer(floor, 1, 1, config.totalFloors);
  const tier = config.tiers.find(entry => normalizedFloor >= entry.minFloor && normalizedFloor <= entry.maxFloor);
  if (!tier) throw new RangeError(`Nenhuma faixa configurada para o andar ${normalizedFloor}.`);
  return tier;
}

export function createEncounterSpec(floor, config = GAME_CONFIG.firstCave) {
  const normalizedFloor = integer(floor, 1, 1, config.totalFloors);
  const tier = getCaveTier(normalizedFloor, config);
  const offset = normalizedFloor - tier.minFloor;
  const hp = Math.round(tier.stats.hpBase + offset * tier.stats.hpPerFloor);
  const attack = Math.round(tier.stats.attackBase + offset * tier.stats.attackPerFloor);
  const name = tier.names[offset % tier.names.length];
  return {
    caveId: config.id,
    regionId: config.id,
    floor: normalizedFloor,
    tierId: tier.id,
    tierLabel: tier.label,
    archetype: tier.archetype,
    boss: tier.archetype === "boss",
    name,
    hp,
    attack,
    speed: tier.stats.speed,
    ai: tier.ai,
    rewards: tier.rewards,
    loot: tier.loot,
    firstVictory: tier.firstVictory || null,
    firstVictoryKey: tier.firstVictoryKey || (config.id === "caverna_sombria" ? "goblinKingFirstVictory" : `${config.id}FirstVictory`),
    visual: {
      ...tier.visual,
      species: tier.visual.speciesByName?.[name] || tier.visual.species
    }
  };
}

export function beginCaveExpedition(progress, config = GAME_CONFIG.firstCave) {
  const floor = progress.currentExpeditionFloor || progress.highestUnlockedFloor || 1;
  progress.currentExpeditionFloor = integer(floor, 1, 1, config.totalFloors);
  return progress.currentExpeditionFloor;
}

export function advanceCaveFloor(progress, completedFloor, config = GAME_CONFIG.firstCave) {
  const total = config.totalFloors;
  const floor = integer(completedFloor, 1, 1, total);
  progress.floorCompletions[floor] = (progress.floorCompletions[floor] || 0) + 1;
  if (floor < total) {
    progress.highestUnlockedFloor = Math.max(progress.highestUnlockedFloor, floor + 1);
    progress.currentExpeditionFloor = floor + 1;
  } else {
    progress.highestUnlockedFloor = total;
    progress.currentExpeditionFloor = total;
    progress.bossVictories += 1;
  }
  return { completedFloor: floor, nextFloor: floor < total ? floor + 1 : null, bossDefeated: floor === total };
}

export function abandonCaveExpedition(progress) {
  progress.currentExpeditionFloor = null;
}

export function grantEncounterRewards(progress, spec, random = Math.random) {
  const rewards = spec.rewards;
  const multiplier = Number(rewards.multiplier) || 1;
  const xp = Math.round((rewards.xpBase + spec.floor * rewards.xpPerFloor) * multiplier);
  const coins = Math.round((rewards.coinsBase + spec.floor * rewards.coinsPerFloor + Math.floor(random() * (rewards.coinVariance + 1))) * multiplier);
  const loot = rollLoot(spec.loot, spec.floor, random);
  let firstVictory = null;
  if (spec.boss && spec.firstVictory && !progress.uniqueRewardsClaimed[spec.firstVictoryKey]) {
    progress.uniqueRewardsClaimed[spec.firstVictoryKey] = true;
    firstVictory = {
      xp: spec.firstVictory.xp,
      coins: spec.firstVictory.coins,
      items: spec.firstVictory.items.map(item => ({ ...item }))
    };
  }
  return { xp, coins, loot, firstVictory };
}

function booleanRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, claimed]) => [key, Boolean(claimed)]));
}

function numberRecord(value, total) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, amount]) => {
    const floor = integer(key, 0, 1, total);
    const count = integer(amount, 0, 0, 1000000);
    return floor && count ? [[floor, count]] : [];
  }));
}

function integer(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}
