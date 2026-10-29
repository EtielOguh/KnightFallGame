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

export const EXPEDITION_STATES = Object.freeze({
  ACTIVE: "active",
  FLOOR_COMPLETED: "floor_completed",
  FARMING: "farming",
  BOSS_PREPARATION: "boss_preparation",
  BOSS_PENDING: "boss_pending",
  BOSS_ACTIVE: "boss_active",
  CAVE_COMPLETED: "cave_completed"
});

const EXPEDITION_STATE_VALUES = new Set(Object.values(EXPEDITION_STATES));
let expeditionSequence = 0;

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
  const expedition = normalizeExpedition(raw.expedition, config);
  const highestUnlockedFloor = Math.max(integer(raw.highestUnlockedFloor, legacyFloor, 1, total), expedition?.floor || 1);
  const selectedFloor = expedition?.floor
    || integer(raw.selectedFloor ?? raw.currentExpeditionFloor, highestUnlockedFloor, 1, highestUnlockedFloor);
  const floorKills = numberRecord(raw.floorKills, total);
  const floorObjectivesCompleted = floorBooleanRecord(raw.floorObjectivesCompleted, total);
  const bossVictories = integer(raw.bossVictories, 0, 0, 1000000);
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
    },
    expedition
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
  if (!tier) throw new RangeError(`Nenhuma faixa comum configurada para o andar ${normalizedFloor}.`);
  return tier;
}

function getBossTier(config = GAME_CONFIG.firstCave) {
  if (!config.boss || config.boss.archetype !== "boss") throw new RangeError(`Chefe não configurado para ${config.id}.`);
  return config.boss;
}

export function getFloorRule(floor, config = GAME_CONFIG.firstCave) {
  const normalizedFloor = integer(floor, 1, 1, config.totalFloors);
  const rule = config.farm?.floorRules?.find(entry => entry.floor === normalizedFloor);
  if (!rule) throw new RangeError(`Regra de dificuldade ausente para o andar ${normalizedFloor}.`);
  return rule;
}

export function createEncounterSpec(floor, config = GAME_CONFIG.firstCave, roleId = null) {
  const normalizedFloor = integer(floor, 1, 1, config.totalFloors);
  const requestedRole = typeof roleId === "string" ? roleId : roleId?.roleId;
  const boss = requestedRole === "boss";
  const tier = boss ? getBossTier(config) : getCaveTier(normalizedFloor, config);
  const role = boss ? null : config.farm?.roles?.[requestedRole] || null;
  const rule = getFloorRule(normalizedFloor, config);
  const multipliers = boss ? { hp: 1, attack: 1, defense: 1 } : rule.multipliers;
  const offset = normalizedFloor - (tier.minFloor || normalizedFloor);
  const hp = Math.max(1, Math.round(tier.stats.hpBase * multipliers.hp * (role?.hp || 1)));
  const attack = Math.max(1, Math.round(tier.stats.attackBase * multipliers.attack * (role?.attack || 1)));
  const defense = Math.max(0, Math.round((tier.stats.defenseBase || 0) * multipliers.defense * (role?.defense || 1)));
  const names = role?.names?.length ? role.names : tier.names;
  const name = names[Math.max(0, offset) % names.length];
  const rewardMultiplier = role?.reward || 1;
  return {
    caveId: config.id,
    regionId: config.id,
    floor: normalizedFloor,
    tierId: tier.id,
    tierLabel: tier.label,
    archetype: role?.archetype || tier.archetype,
    roleId: boss ? "boss" : requestedRole || tier.archetype,
    boss,
    name,
    hp,
    attack,
    defense,
    speed: Math.round(tier.stats.speed * (role?.speed || 1)),
    ai: { ...tier.ai, ...(role?.ai || {}) },
    rewards: { ...tier.rewards, multiplier: (Number(tier.rewards.multiplier) || 1) * rewardMultiplier },
    loot: tier.loot,
    firstVictory: tier.firstVictory || null,
    firstVictoryKey: tier.firstVictoryKey || (config.id === "caverna_sombria" ? "goblinKingFirstVictory" : `${config.id}FirstVictory`),
    visual: {
      ...tier.visual,
      ...(role?.visual || {}),
      species: tier.visual.speciesByName?.[name] || tier.visual.species
    }
  };
}

function createExpedition(regionId, config, options = {}) {
  expeditionSequence += 1;
  const now = Date.now();
  return {
    id: options.id || `expedition_${regionId}_${now}_${expeditionSequence}`,
    regionId,
    floor: 1,
    state: EXPEDITION_STATES.ACTIVE,
    floorKills: {},
    farmKills: {},
    completedFloors: {},
    bossUnlocked: false,
    bossSpawned: false,
    bossDefeated: false,
    completed: false,
    startedAt: now,
    updatedAt: now
  };
}

export function beginCaveExpedition(progress, config = GAME_CONFIG.firstCave, options = {}) {
  if (!progress.expedition || options.forceNew) progress.expedition = createExpedition(config.id, config, options);
  progress.selectedFloor = progress.expedition.floor;
  return progress.expedition.floor;
}

export function startNewCaveExpedition(progress, config = GAME_CONFIG.firstCave, options = {}) {
  progress.expedition = createExpedition(config.id, config, options);
  progress.selectedFloor = 1;
  return progress.expedition;
}

export function abandonCaveExpedition(progress) {
  return progress.expedition?.floor || progress.selectedFloor || 1;
}

export function finishCaveExit(progress) {
  if (!progress.expedition?.completed) return false;
  progress.expedition = null;
  progress.selectedFloor = 1;
  return true;
}

export function getFloorUnlockTarget(floor, config = GAME_CONFIG.firstCave) {
  return getFloorRule(floor, config).kills;
}

export function getFloorAdvanceState(progress, floor, config = GAME_CONFIG.firstCave) {
  const expedition = progress?.expedition;
  const normalizedFloor = integer(floor, expedition?.floor || 1, 1, config.totalFloors);
  const target = getFloorUnlockTarget(normalizedFloor, config);
  const kills = Math.max(0, Math.floor(Number(expedition?.floorKills?.[normalizedFloor]) || 0));
  const completed = Boolean(expedition?.completedFloors?.[normalizedFloor] || kills >= target);
  const nextFloor = normalizedFloor < config.totalFloors ? normalizedFloor + 1 : null;
  const available = Boolean(expedition && expedition.floor === normalizedFloor && nextFloor && completed
    && [EXPEDITION_STATES.FLOOR_COMPLETED, EXPEDITION_STATES.FARMING].includes(expedition.state));
  return { floor: normalizedFloor, kills, target, completed, nextFloor, available, state: expedition?.state || null };
}

export function getFloorFarmConfig(floor, config = GAME_CONFIG.firstCave) {
  const normalizedFloor = integer(floor, 1, 1, config.totalFloors);
  const band = config.farm?.bands?.find(entry => normalizedFloor >= entry.minFloor && normalizedFloor <= entry.maxFloor) || {};
  const rule = getFloorRule(normalizedFloor, config);
  return {
    minFloor: normalizedFloor,
    maxFloor: normalizedFloor,
    ...band,
    waveSize: [...rule.waveSize],
    maxActive: rule.maxActive,
    maxRanged: rule.maxRanged,
    multipliers: { ...rule.multipliers },
    kills: rule.kills,
    roles: band.roles || { [getCaveTier(normalizedFloor, config).archetype]: 1 }
  };
}

export function createWavePlan(floor, config = GAME_CONFIG.firstCave, random = Math.random) {
  const normalizedFloor = integer(floor, 1, 1, config.totalFloors);
  const band = getFloorFarmConfig(normalizedFloor, config);
  const roles = Object.entries(band.roles || { common: 1 }).filter(([, weight]) => Number(weight) > 0);
  const [minimumSize, maximumSize] = band.waveSize || [1, 1];
  const desiredSize = randomInteger(minimumSize, maximumSize, random);
  const [minimumThreat, maximumThreat] = band.threatBudget || [minimumSize, maximumSize * 2];
  const threatBudget = minimumThreat + random() * Math.max(0, maximumThreat - minimumThreat);
  const plan = [];
  let threat = 0;
  let rangedCount = 0;
  for (let index = 0; index < desiredSize; index += 1) {
    const affordable = roles.filter(([candidateRoleId]) => {
      const role = config.farm?.roles?.[candidateRoleId];
      const ranged = role?.archetype === "archer" || role?.archetype === "thrower";
      return threat + (role?.threat || 1) <= threatBudget + .001
        && (!ranged || rangedCount < (band.maxRanged ?? desiredSize));
    });
    const cheapest = [...roles].sort(([left], [right]) => (config.farm?.roles?.[left]?.threat || 1) - (config.farm?.roles?.[right]?.threat || 1))[0];
    const pool = affordable.length ? affordable : plan.length < minimumSize && cheapest ? [cheapest] : [];
    if (!pool.length) break;
    const selectedRoleId = weightedChoice(pool, random);
    plan.push(selectedRoleId);
    const role = config.farm?.roles?.[selectedRoleId];
    threat += role?.threat || 1;
    if (role?.archetype === "archer" || role?.archetype === "thrower") rangedCount += 1;
  }
  return plan.length ? plan : [roles[0]?.[0] || "common"];
}

export function advanceCaveFloor(progress, completedFloor, config = GAME_CONFIG.firstCave) {
  const expedition = progress.expedition;
  const floor = integer(completedFloor, expedition?.floor || 1, 1, config.totalFloors);
  if (!expedition || expedition.floor !== floor || floor >= config.totalFloors
    || ![EXPEDITION_STATES.FLOOR_COMPLETED, EXPEDITION_STATES.FARMING].includes(expedition.state)) {
    return { ok: false, reason: "O próximo andar ainda não está disponível." };
  }
  expedition.floor = floor + 1;
  expedition.state = expedition.floor === config.totalFloors ? EXPEDITION_STATES.BOSS_PREPARATION : EXPEDITION_STATES.ACTIVE;
  expedition.updatedAt = Date.now();
  progress.selectedFloor = expedition.floor;
  progress.floorCompletions[floor] = (progress.floorCompletions[floor] || 0) + 1;
  progress.highestUnlockedFloor = Math.max(progress.highestUnlockedFloor, expedition.floor);
  return { ok: true, completedFloor: floor, nextFloor: expedition.floor, bossDefeated: false };
}

export function stayOnCompletedFloor(progress, config = GAME_CONFIG.firstCave) {
  const expedition = progress.expedition;
  if (!expedition || expedition.floor >= config.totalFloors
    || ![EXPEDITION_STATES.FLOOR_COMPLETED, EXPEDITION_STATES.FARMING].includes(expedition.state)) {
    return { ok: false, reason: "Este andar ainda não foi concluído." };
  }
  expedition.state = EXPEDITION_STATES.FARMING;
  expedition.updatedAt = Date.now();
  return { ok: true, floor: expedition.floor };
}

export function recordFloorKill(progress, floor, config = GAME_CONFIG.firstCave, options = {}) {
  const expedition = progress.expedition;
  const normalizedFloor = integer(floor, 1, 1, config.totalFloors);
  if (!expedition || expedition.regionId !== config.id || expedition.floor !== normalizedFloor
    || (options.expeditionId && options.expeditionId !== expedition.id)
    || (options.regionId && options.regionId !== config.id)) {
    return { counted: false, reason: "enemy_outside_expedition", floor: normalizedFloor };
  }

  if (options.boss) {
    if (expedition.state !== EXPEDITION_STATES.BOSS_ACTIVE || expedition.bossDefeated) {
      return { counted: false, reason: "boss_already_resolved", floor: normalizedFloor, bossDefeated: expedition.bossDefeated };
    }
    expedition.bossDefeated = true;
    expedition.completed = true;
    expedition.state = EXPEDITION_STATES.CAVE_COMPLETED;
    expedition.completedFloors[normalizedFloor] = true;
    expedition.updatedAt = Date.now();
    progress.floorCompletions[normalizedFloor] = (progress.floorCompletions[normalizedFloor] || 0) + 1;
    progress.bossVictories += 1;
    progress.highestUnlockedFloor = config.totalFloors;
    progress.floorObjectivesCompleted[normalizedFloor] = true;
    return { counted: true, floor: normalizedFloor, kills: expedition.floorKills[normalizedFloor] || 0, target: getFloorUnlockTarget(normalizedFloor, config), unlocked: false, bossDefeated: true, caveCompleted: true };
  }

  if (expedition.state === EXPEDITION_STATES.FARMING) {
    expedition.farmKills[normalizedFloor] = (expedition.farmKills[normalizedFloor] || 0) + 1;
    expedition.updatedAt = Date.now();
    return { counted: true, farmOnly: true, floor: normalizedFloor, kills: expedition.floorKills[normalizedFloor] || 0, target: getFloorUnlockTarget(normalizedFloor, config), unlocked: false, bossDefeated: false };
  }

  const countableStates = [EXPEDITION_STATES.ACTIVE, EXPEDITION_STATES.BOSS_PREPARATION];
  if (!countableStates.includes(expedition.state)) {
    return { counted: false, reason: "objective_already_completed", floor: normalizedFloor, kills: expedition.floorKills[normalizedFloor] || 0, target: getFloorUnlockTarget(normalizedFloor, config) };
  }

  const target = getFloorUnlockTarget(normalizedFloor, config);
  expedition.floorKills[normalizedFloor] = Math.min(target, (expedition.floorKills[normalizedFloor] || 0) + 1);
  expedition.updatedAt = Date.now();
  const kills = expedition.floorKills[normalizedFloor];
  const completed = kills >= target;
  if (completed) {
    expedition.completedFloors[normalizedFloor] = true;
    progress.floorKills[normalizedFloor] = Math.max(progress.floorKills[normalizedFloor] || 0, target);
    progress.floorObjectivesCompleted[normalizedFloor] = true;
    if (normalizedFloor === config.totalFloors) {
      expedition.bossUnlocked = true;
      expedition.state = EXPEDITION_STATES.BOSS_PENDING;
    } else {
      expedition.state = EXPEDITION_STATES.FLOOR_COMPLETED;
      progress.highestUnlockedFloor = Math.max(progress.highestUnlockedFloor, normalizedFloor + 1);
    }
  }
  return {
    counted: true,
    floor: normalizedFloor,
    kills,
    target,
    unlocked: completed && normalizedFloor < config.totalFloors,
    nextFloor: completed && normalizedFloor < config.totalFloors ? normalizedFloor + 1 : null,
    bossUnlocked: completed && normalizedFloor === config.totalFloors,
    bossDefeated: false
  };
}

export function canSpawnCommonEnemies(progress) {
  return Boolean(progress?.expedition && [
    EXPEDITION_STATES.ACTIVE,
    EXPEDITION_STATES.FARMING,
    EXPEDITION_STATES.BOSS_PREPARATION
  ].includes(progress.expedition.state));
}

export function markBossSpawned(progress, config = GAME_CONFIG.firstCave, options = {}) {
  const expedition = progress?.expedition;
  const activeCommonCount = Math.max(0, Math.floor(Number(options.activeCommonCount) || 0));
  if (!expedition || expedition.floor !== config.totalFloors || expedition.state !== EXPEDITION_STATES.BOSS_PENDING
    || expedition.bossSpawned || expedition.bossDefeated || activeCommonCount > 0) {
    return { ok: false, reason: activeCommonCount > 0 ? "Ainda existem ameaças comuns ativas." : "Boss não está pronto para ser invocado." };
  }
  expedition.bossSpawned = true;
  expedition.state = EXPEDITION_STATES.BOSS_ACTIVE;
  expedition.updatedAt = Date.now();
  return { ok: true, expeditionId: expedition.id, floor: expedition.floor };
}

export function prepareExpeditionAfterLoad(progress) {
  const expedition = progress?.expedition;
  if (!expedition) return null;
  // Entidades não são persistidas. Um chefe salvo em combate retorna inteiro,
  // mas a trava de invocação é rearmada para que exista apenas uma instância.
  if (expedition.state === EXPEDITION_STATES.BOSS_ACTIVE && !expedition.bossDefeated) {
    expedition.state = EXPEDITION_STATES.BOSS_PENDING;
    expedition.bossSpawned = false;
  }
  expedition.updatedAt = Date.now();
  return expedition;
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

function normalizeExpedition(raw, config) {
  if (!raw || typeof raw !== "object" || raw.regionId !== config.id || typeof raw.id !== "string" || !raw.id) return null;
  const floor = integer(raw.floor, 1, 1, config.totalFloors);
  let state = EXPEDITION_STATE_VALUES.has(raw.state) ? raw.state : floor === config.totalFloors ? EXPEDITION_STATES.BOSS_PREPARATION : EXPEDITION_STATES.ACTIVE;
  const floorKills = numberRecord(raw.floorKills, config.totalFloors);
  const completedFloors = floorBooleanRecord(raw.completedFloors, config.totalFloors);
  const bossDefeated = Boolean(raw.bossDefeated || raw.completed);
  if (bossDefeated) state = EXPEDITION_STATES.CAVE_COMPLETED;
  return {
    id: raw.id,
    regionId: config.id,
    floor,
    state,
    floorKills,
    farmKills: numberRecord(raw.farmKills, config.totalFloors),
    completedFloors,
    bossUnlocked: Boolean(raw.bossUnlocked || completedFloors[config.totalFloors]),
    bossSpawned: Boolean(raw.bossSpawned && !bossDefeated),
    bossDefeated,
    completed: bossDefeated,
    startedAt: finiteTimestamp(raw.startedAt),
    updatedAt: finiteTimestamp(raw.updatedAt)
  };
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

function finiteTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : Date.now();
}

function integer(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}
