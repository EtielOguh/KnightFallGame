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
  const selectedFloor = integer(raw.selectedFloor ?? raw.currentExpeditionFloor, highestUnlockedFloor, 1, highestUnlockedFloor);
  const floorKills = numberRecord(raw.floorKills, total);
  const floorObjectivesCompleted = floorBooleanRecord(raw.floorObjectivesCompleted, total);
  // Saves anteriores já tinham conquistado esses andares. A migração não exige
  // que o jogador refaça os novos objetivos de abate.
  for (let floor = 1; floor < highestUnlockedFloor; floor += 1) {
    floorObjectivesCompleted[floor] = true;
    floorKills[floor] = Math.max(floorKills[floor] || 0, getFloorUnlockTarget(floor, config));
  }
  const bossVictories = integer(raw.bossVictories, 0, 0, 1000000);
  if (bossVictories > 0) {
    floorObjectivesCompleted[total] = true;
    floorKills[total] = Math.max(floorKills[total] || 0, bossVictories);
  }
  return {
    highestUnlockedFloor,
    selectedFloor,
    floorKills,
    floorObjectivesCompleted,
    floorCompletions: numberRecord(raw.floorCompletions, total),
    bossVictories,
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
    const sourceRegion = Object.entries(GAME_CONFIG.regions).find(([, entry]) => entry.bossId === rule.bossId)?.[0];
    const unlocked = sourceRegion ? (world.regionProgress?.[sourceRegion]?.bossVictories || 0) > 0 : false;
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

export function createEncounterSpec(floor, config = GAME_CONFIG.firstCave, roleId = null) {
  const normalizedFloor = integer(floor, 1, 1, config.totalFloors);
  const tier = getCaveTier(normalizedFloor, config);
  const requestedRole = typeof roleId === "string" ? roleId : roleId?.roleId;
  const role = tier.archetype === "boss" ? null : config.farm?.roles?.[requestedRole] || null;
  const offset = normalizedFloor - tier.minFloor;
  const hp = Math.round((tier.stats.hpBase + offset * tier.stats.hpPerFloor) * (role?.hp || 1));
  const attack = Math.round((tier.stats.attackBase + offset * tier.stats.attackPerFloor) * (role?.attack || 1));
  const name = tier.names[offset % tier.names.length];
  const rewardMultiplier = role?.reward || 1;
  return {
    caveId: config.id,
    regionId: config.id,
    floor: normalizedFloor,
    tierId: tier.id,
    tierLabel: tier.label,
    archetype: role?.archetype || tier.archetype,
    roleId: requestedRole || tier.archetype,
    boss: tier.archetype === "boss",
    name,
    hp,
    attack,
    speed: Math.round(tier.stats.speed * (role?.speed || 1)),
    ai: { ...tier.ai, ...(role?.ai || {}) },
    rewards: { ...tier.rewards, multiplier: (Number(tier.rewards.multiplier) || 1) * rewardMultiplier },
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
  const floor = progress.selectedFloor || progress.highestUnlockedFloor || 1;
  progress.selectedFloor = integer(floor, 1, 1, Math.min(config.totalFloors, progress.highestUnlockedFloor || 1));
  return progress.selectedFloor;
}

export function advanceCaveFloor(progress, completedFloor, config = GAME_CONFIG.firstCave) {
  const total = config.totalFloors;
  const floor = integer(completedFloor, 1, 1, total);
  progress.floorCompletions[floor] = (progress.floorCompletions[floor] || 0) + 1;
  if (floor < total) {
    progress.floorKills[floor] = Math.max(progress.floorKills[floor] || 0, getFloorUnlockTarget(floor, config));
    progress.floorObjectivesCompleted[floor] = true;
    progress.highestUnlockedFloor = Math.max(progress.highestUnlockedFloor, floor + 1);
  } else {
    progress.highestUnlockedFloor = total;
    progress.selectedFloor = total;
    progress.bossVictories += 1;
    progress.floorKills[total] = Math.max(progress.floorKills[total] || 0, progress.bossVictories);
    progress.floorObjectivesCompleted[total] = true;
  }
  return { completedFloor: floor, nextFloor: floor < total ? floor + 1 : null, bossDefeated: floor === total };
}

export function abandonCaveExpedition(progress) {
  return progress.selectedFloor;
}

export function getFloorUnlockTarget(floor, config = GAME_CONFIG.firstCave) {
  const normalizedFloor = integer(floor, 1, 1, config.totalFloors);
  const configured = config.farm?.unlockKills?.[normalizedFloor - 1];
  return integer(configured, 1, 1, 1000000);
}

export function getFloorFarmConfig(floor, config = GAME_CONFIG.firstCave) {
  const normalizedFloor = integer(floor, 1, 1, config.totalFloors);
  const band = config.farm?.bands?.find(entry => normalizedFloor >= entry.minFloor && normalizedFloor <= entry.maxFloor);
  if (band) return band;
  return { minFloor: normalizedFloor, maxFloor: normalizedFloor, maxActive: 1, waveSize: [1, 1], threatBudget: [1, 1], roles: { [getCaveTier(normalizedFloor, config).archetype]: 1 } };
}

export function createWavePlan(floor, config = GAME_CONFIG.firstCave, random = Math.random) {
  const normalizedFloor = integer(floor, 1, 1, config.totalFloors);
  const spec = createEncounterSpec(normalizedFloor, config);
  if (spec.boss) return ["boss"];
  const band = getFloorFarmConfig(normalizedFloor, config);
  const roles = Object.entries(band.roles || { common: 1 }).filter(([, weight]) => Number(weight) > 0);
  const [minimumSize, maximumSize] = band.waveSize || [1, 1];
  const desiredSize = randomInteger(minimumSize, maximumSize, random);
  const [minimumThreat, maximumThreat] = band.threatBudget || [1, desiredSize];
  const threatBudget = minimumThreat + random() * Math.max(0, maximumThreat - minimumThreat);
  const plan = [];
  let threat = 0;
  for (let index = 0; index < desiredSize; index += 1) {
    const affordable = roles.filter(([roleId]) => threat + (config.farm?.roles?.[roleId]?.threat || 1) <= threatBudget + .001);
    const cheapest = [...roles].sort(([left], [right]) => (config.farm?.roles?.[left]?.threat || 1) - (config.farm?.roles?.[right]?.threat || 1))[0];
    const pool = affordable.length ? affordable : plan.length < minimumSize && cheapest ? [cheapest] : [];
    if (!pool.length) break;
    const roleId = weightedChoice(pool, random);
    plan.push(roleId);
    threat += config.farm?.roles?.[roleId]?.threat || 1;
  }
  return plan.length ? plan : [roles[0]?.[0] || "common"];
}

export function selectCaveFloor(progress, floor, config = GAME_CONFIG.firstCave) {
  const target = integer(floor, 0, 1, config.totalFloors);
  if (!target || target > progress.highestUnlockedFloor) return { ok: false, reason: "Andar ainda não desbloqueado." };
  progress.selectedFloor = target;
  return { ok: true, floor: target };
}

export function recordFloorKill(progress, floor, config = GAME_CONFIG.firstCave, options = {}) {
  const normalizedFloor = integer(floor, 1, 1, config.totalFloors);
  progress.floorKills[normalizedFloor] = (progress.floorKills[normalizedFloor] || 0) + 1;
  const boss = Boolean(options.boss || normalizedFloor === config.totalFloors);
  if (boss) {
    progress.floorCompletions[normalizedFloor] = (progress.floorCompletions[normalizedFloor] || 0) + 1;
    progress.bossVictories += 1;
    progress.floorObjectivesCompleted[normalizedFloor] = true;
    progress.highestUnlockedFloor = Math.max(progress.highestUnlockedFloor, normalizedFloor);
    return { floor: normalizedFloor, kills: progress.floorKills[normalizedFloor], target: 1, unlocked: false, bossDefeated: true };
  }
  const target = getFloorUnlockTarget(normalizedFloor, config);
  const wasCompleted = Boolean(progress.floorObjectivesCompleted[normalizedFloor]);
  const completed = progress.floorKills[normalizedFloor] >= target;
  if (completed) {
    progress.floorObjectivesCompleted[normalizedFloor] = true;
    if (normalizedFloor < config.totalFloors) progress.highestUnlockedFloor = Math.max(progress.highestUnlockedFloor, normalizedFloor + 1);
  }
  return {
    floor: normalizedFloor,
    kills: progress.floorKills[normalizedFloor],
    target,
    unlocked: completed && !wasCompleted && normalizedFloor < config.totalFloors,
    nextFloor: completed && normalizedFloor < config.totalFloors ? normalizedFloor + 1 : null,
    bossDefeated: false
  };
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

function floorBooleanRecord(value, total) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, completed]) => {
    const floor = integer(key, 0, 1, total);
    return floor && completed ? [[floor, true]] : [];
  }));
}

function randomInteger(minimum, maximum, random) {
  const min = Math.max(1, Math.floor(Number(minimum) || 1));
  const max = Math.max(min, Math.floor(Number(maximum) || min));
  return min + Math.floor(random() * (max - min + 1));
}

function weightedChoice(entries, random) {
  const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
  let roll = random() * total;
  for (const [id, weight] of entries) {
    roll -= Number(weight);
    if (roll <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

function integer(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}
