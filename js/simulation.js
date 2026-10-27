import { GAME_CONFIG, ITEMS } from "./data.js";
import {
  createEncounterSpec, createWavePlan, getFloorFarmConfig, getFloorUnlockTarget,
  getRegionConfig, grantEncounterRewards, recordFloorKill
} from "./dungeon.js";
import { enhanceEquipment, purchaseEquipment } from "./forge.js";
import {
  addInventoryItem, calculateItemStats, calculateStats, canEquipItem, equipItem,
  getEquippedEntry, inventoryCount, removeInventoryItem
} from "./player.js";
import { grantPlayerExperience } from "./progression.js";
import { createInitialState } from "./state.js";

export const SIMULATION_PROFILES = Object.freeze({
  standard: Object.freeze({
    label: "Jogador padrão", hitRate: .78, attackCadence: .72, dodgeRate: .58,
    explorationSeconds: 38, villageEvery: 4, villageSeconds: 45, forgeEvery: 45
  }),
  skilled: Object.freeze({
    label: "Jogador experiente", hitRate: .9, attackCadence: .54, dodgeRate: .78,
    explorationSeconds: 18, villageEvery: 5, villageSeconds: 34, forgeEvery: 40
  }),
  cautious: Object.freeze({
    label: "Jogador cauteloso", hitRate: .68, attackCadence: .9, dodgeRate: .44,
    explorationSeconds: 38, villageEvery: 3, villageSeconds: 58, forgeEvery: 50
  })
});

export const PROGRESSION_HYPOTHESES = Object.freeze({
  firstReward: [0, 180],
  firstLevelOrUpgrade: [180, 420],
  firstEquipmentChange: [420, 720],
  firstForge: [720, 1200],
  // Com 122–151 abates até a faixa avançada, 35–50 min é a hipótese inicial
  // compatível com o novo objetivo de farm prolongado.
  firstElite: [2100, 3000]
});

export function createSeededRandom(seed = 1) {
  let value = normalizeSeed(seed);
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ next >>> 15, next | 1);
    next ^= next + Math.imul(next ^ next >>> 7, next | 61);
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}

export function simulateProgression(options = {}) {
  const seed = normalizeSeed(options.seed ?? 1);
  const profileId = SIMULATION_PROFILES[options.profile] ? options.profile : "standard";
  const profile = SIMULATION_PROFILES[profileId];
  const regionId = options.regionId || "caverna_sombria";
  const config = getRegionConfig(regionId);
  const random = createSeededRandom(seed);
  const state = createInitialState({ id: `sim_player_${seed}` });
  const player = state.player;
  const progress = state.world.regionProgress[regionId];
  const initialStats = calculateStats(player);
  const initialWeaponUid = player.equipment.weapon;
  const metrics = {
    seed, profile: profileId, regionId, elapsedSeconds: 0, fights: 0, victories: 0, waves: 0, deaths: 0,
    goldEarned: 0, goldSpent: 0, materialsFound: {}, equipmentFound: {}, improvements: [],
    timeToKill: [], levelUps: [], potionsUsed: 0, killsByFloor: {}, unlockSeconds: {}, bossAttempts: 0, boss: null,
    milestones: { firstReward: null, firstLevelOrUpgrade: null, firstEquipmentChange: null, firstForge: null, firstElite: null }
  };
  let floor = 1;
  let retries = 0;
  const requiredVictories = Array.from({ length: config.totalFloors }, (_, index) => getFloorUnlockTarget(index + 1, config)).reduce((sum, amount) => sum + amount, 0);
  const maxFights = Math.max(requiredVictories, Math.floor(options.maxFights || requiredVictories * 1.8));

  while (floor <= config.totalFloors && metrics.fights < maxFights) {
    const targetKills = getFloorUnlockTarget(floor, config);
    let floorKills = 0;
    let wave = [];
    while (floorKills < targetKills && metrics.fights < maxFights) {
      if (!wave.length) {
        wave = createWavePlan(floor, config, random);
        metrics.waves += 1;
      }
      const roleId = wave.shift();
      const spec = createEncounterSpec(floor, config, roleId);
      if ((roleId === "elite" || spec.archetype === "elite") && metrics.milestones.firstElite == null) metrics.milestones.firstElite = round(metrics.elapsedSeconds);
      if (spec.boss) metrics.bossAttempts += 1;
      metrics.fights += 1;

      const pressure = Math.min(getFloorFarmConfig(floor, config).maxActive, wave.length + 1);
      const combat = estimateManualCombat(player, spec, profile, random, pressure);
      metrics.timeToKill.push({ floor, archetype: spec.archetype, roleId, seconds: combat.killSeconds });
      metrics.elapsedSeconds += combat.killSeconds;
      player.hp -= combat.damageTaken;
      useEmergencyPotions(player, metrics);

      if (player.hp <= 0) {
        metrics.deaths += 1;
        const loss = Math.min(player.coins, Math.max(GAME_CONFIG.economy.defeatMinimumCoinLoss, Math.floor(player.coins * GAME_CONFIG.economy.defeatCoinLossRatio)));
        player.coins -= loss;
        metrics.goldSpent += loss;
        metrics.elapsedSeconds += 48;
        player.hp = calculateStats(player).maxHp;
        retries += 1;
        wave = [];
        if (retries >= 5) break;
        continue;
      }

      retries = 0;
      metrics.victories += 1;
      floorKills += 1;
      metrics.killsByFloor[floor] = floorKills;
      player.progression.kills += 1;
      const reward = grantEncounterRewards(progress, spec, random);
      const bonus = reward.firstVictory || { xp: 0, coins: 0, items: [] };
      const coins = reward.coins + bonus.coins;
      const xp = reward.xp + bonus.xp;
      player.coins += coins;
      metrics.goldEarned += coins;
      if (metrics.milestones.firstReward == null) metrics.milestones.firstReward = round(metrics.elapsedSeconds);

      const levelResult = grantPlayerExperience(player, xp);
      if (levelResult.levels) {
        const levelEvent = { at: round(metrics.elapsedSeconds), fights: metrics.fights, level: player.level };
        metrics.levelUps.push(levelEvent);
        metrics.improvements.push({ kind: "level", ...levelEvent });
        if (metrics.milestones.firstLevelOrUpgrade == null) metrics.milestones.firstLevelOrUpgrade = round(metrics.elapsedSeconds);
      }

      collectDrops(player, [...reward.loot, ...bonus.items], metrics);
      recordFloorKill(progress, floor, config, { boss: spec.boss });
      if (spec.boss) {
        metrics.boss = {
          floor, killSeconds: combat.killSeconds, damageTaken: combat.damageTaken,
          maxHp: calculateStats(player).maxHp, dangerRatio: round(combat.damageTaken / Math.max(1, calculateStats(player).maxHp), 3),
          attempts: metrics.bossAttempts
        };
      }
      if (!wave.length && player.hp / Math.max(1, calculateStats(player).maxHp) < .42) {
        metrics.elapsedSeconds += 24;
        const restCost = Math.min(player.coins, GAME_CONFIG.economy.restPrice);
        player.coins -= restCost;
        metrics.goldSpent += restCost;
        player.hp = calculateStats(player).maxHp;
      }
    }
    if (floorKills < targetKills) break;
    metrics.unlockSeconds[floor] = round(metrics.elapsedSeconds);
    floor += 1;
    metrics.elapsedSeconds += profile.explorationSeconds * (.9 + random() * .2);

    if ((floor - 1) % profile.villageEvery === 0 || floor > config.totalFloors) {
      metrics.elapsedSeconds += profile.villageSeconds;
      visitVillage(player, metrics, profile, initialWeaponUid);
      player.hp = calculateStats(player).maxHp;
    }
  }

  const finalStats = calculateStats(player);
  const weapon = getEquippedEntry(player, "weapon");
  const milestoneAssessment = Object.fromEntries(Object.entries(PROGRESSION_HYPOTHESES).map(([key, range]) => {
    const seconds = metrics.milestones[key];
    return [key, { seconds, target: range, withinTarget: seconds != null && seconds >= range[0] && seconds <= range[1] }];
  }));
  return {
    ...metrics,
    completed: floor > config.totalFloors,
    endingFloor: Math.min(floor, config.totalFloors),
    level: player.level,
    xp: player.xp,
    coins: player.coins,
    initialStats,
    finalStats,
    statGrowth: Object.fromEntries(Object.keys(initialStats).map(key => [key, round(finalStats[key] - initialStats[key], 2)])),
    weapon: weapon ? { definitionId: weapon.definitionId, enhancementLevel: weapon.enhancementLevel, stats: calculateItemStats(weapon) } : null,
    meanKillSeconds: round(average(metrics.timeToKill.map(entry => entry.seconds)), 2),
    goldPerMinute: round(metrics.goldEarned / Math.max(1, metrics.elapsedSeconds / 60), 2),
    milestoneAssessment
  };
}

export function simulateCohort(options = {}) {
  const runs = Math.max(1, Math.floor(options.runs || 100));
  const seed = normalizeSeed(options.seed ?? 1);
  const results = Array.from({ length: runs }, (_, index) => simulateProgression({ ...options, seed: seed + index }));
  const milestoneKeys = Object.keys(PROGRESSION_HYPOTHESES);
  return {
    seed, runs, profile: options.profile || "standard", regionId: options.regionId || "caverna_sombria",
    completionRate: round(results.filter(result => result.completed).length / runs, 3),
    meanLevel: round(average(results.map(result => result.level)), 2),
    meanKillSeconds: round(average(results.map(result => result.meanKillSeconds)), 2),
    meanGoldEarned: round(average(results.map(result => result.goldEarned)), 2),
    meanGoldSpent: round(average(results.map(result => result.goldSpent)), 2),
    meanGoldPerMinute: round(average(results.map(result => result.goldPerMinute)), 2),
    meanDeaths: round(average(results.map(result => result.deaths)), 2),
    meanFights: round(average(results.map(result => result.fights)), 2),
    medianFightsToFirstLevel: median(results.map(result => result.levelUps[0]?.fights).filter(Number.isFinite)),
    meanImprovements: round(average(results.map(result => result.improvements.length)), 2),
    meanEquipmentChanges: round(average(results.map(result => result.improvements.filter(entry => entry.kind === "equipment").length)), 2),
    meanForgeEnhancements: round(average(results.map(result => result.improvements.filter(entry => entry.kind === "forge").length)), 2),
    milestoneMedianSeconds: Object.fromEntries(milestoneKeys.map(key => [key, median(results.map(result => result.milestones[key]).filter(Number.isFinite))])),
    milestoneTargetRate: Object.fromEntries(milestoneKeys.map(key => [key, round(results.filter(result => result.milestoneAssessment[key].withinTarget).length / runs, 3)])),
    meanEquipmentDrops: round(average(results.map(result => totalValues(result.equipmentFound))), 2),
    meanMaterialDrops: round(average(results.map(result => totalValues(result.materialsFound))), 2),
    boss: {
      meanKillSeconds: round(average(results.map(result => result.boss?.killSeconds).filter(Number.isFinite)), 2),
      meanDangerRatio: round(average(results.map(result => result.boss?.dangerRatio).filter(Number.isFinite)), 3),
      meanAttempts: round(average(results.map(result => result.boss?.attempts).filter(Number.isFinite)), 2)
    }
  };
}

function estimateManualCombat(player, spec, profile, random, pressure = 1) {
  const stats = calculateStats(player);
  const variance = average(GAME_CONFIG.combat.playerDamageVariance);
  const critFactor = 1 + stats.crit / 100 * .5;
  const averageDamage = Math.max(1, stats.attack * variance * critFactor);
  const hits = Math.max(1, Math.ceil(spec.hp / averageDamage));
  const approach = ({ common: 5, warrior: 7, archer: 12, elite: 10, boss: 14 })[spec.archetype] || 7;
  const hordeEfficiency = 1 + Math.max(0, pressure - 1) * .18;
  const killSeconds = (approach + hits * profile.attackCadence / profile.hitRate) * (.92 + random() * .16) / hordeEfficiency;
  const enemyCycle = Math.max(.55, spec.ai.telegraph + spec.ai.attackDuration + spec.ai.recovery);
  const exposure = spec.boss ? .82 : spec.archetype === "elite" ? .62 : .52;
  const attempts = Math.max(spec.boss ? 2 : 0, Math.floor(killSeconds / enemyCycle * exposure));
  const avoidChance = Math.min(.94, profile.dodgeRate + Math.min(.14, spec.ai.telegraph * .12));
  let landed = 0;
  for (let index = 0; index < attempts; index += 1) if (random() > avoidChance) landed += 1;
  const patternFactor = spec.boss ? 1.22 : spec.archetype === "elite" ? 1.14 : 1;
  const damagePerHit = Math.max(GAME_CONFIG.combat.minimumDamageTaken, spec.attack * patternFactor - stats.armor);
  return { killSeconds: round(killSeconds, 2), damageTaken: round(landed * damagePerHit * (1 + Math.max(0, pressure - 1) * .14), 2), hits, landed };
}

function collectDrops(player, drops, metrics) {
  for (const drop of drops) {
    const item = ITEMS[drop.definitionId];
    if (!item) continue;
    const added = addInventoryItem(player, drop.definitionId, drop.quantity, { markNew: false });
    if (!added) continue;
    const ledger = item.type === "equipment" ? metrics.equipmentFound : item.type === "material" ? metrics.materialsFound : null;
    if (ledger) ledger[drop.definitionId] = (ledger[drop.definitionId] || 0) + drop.quantity;
  }
}

function useEmergencyPotions(player, metrics) {
  const maxHp = calculateStats(player).maxHp;
  const order = ["pocao_menor", "pocao_maior", "pocao_suprema"];
  while (player.hp <= 0) {
    const potionId = order.find(id => inventoryCount(player, id) > 0);
    if (!potionId || !removeInventoryItem(player, potionId, 1)) return;
    player.hp += ITEMS[potionId].heal;
    metrics.potionsUsed += 1;
  }
  if (player.hp / maxHp > .38) return;
  const potionId = order.find(id => inventoryCount(player, id) > 0);
  if (!potionId || !removeInventoryItem(player, potionId, 1)) return;
  player.hp = Math.min(maxHp, player.hp + ITEMS[potionId].heal);
  metrics.potionsUsed += 1;
}

function visitVillage(player, metrics, profile, initialWeaponUid) {
  buyBestMerchantUpgrade(player, metrics);
  equipBestOwnedItems(player, metrics, initialWeaponUid);
  if (metrics.victories >= profile.forgeEvery) reinforceWeapon(player, metrics);
  if (player.progression.upgrades.attack < GAME_CONFIG.economy.attackUpgrade.maxPurchases && player.coins >= attackUpgradePrice(player)) {
    const cost = attackUpgradePrice(player);
    player.coins -= cost;
    player.baseStats.attack += GAME_CONFIG.economy.attackUpgrade.amount;
    player.progression.upgrades.attack += 1;
    metrics.goldSpent += cost;
    metrics.improvements.push({ kind: "permanent", at: round(metrics.elapsedSeconds), stat: "attack", cost });
    if (metrics.milestones.firstLevelOrUpgrade == null) metrics.milestones.firstLevelOrUpgrade = round(metrics.elapsedSeconds);
  }
}

function buyBestMerchantUpgrade(player, metrics) {
  const candidates = GAME_CONFIG.economy.merchantEquipment
    .map(definitionId => ITEMS[definitionId])
    .filter(item => item && item.requiredLevel <= player.level && item.buyPrice <= player.coins)
    .sort((a, b) => equipmentScore(b) - equipmentScore(a));
  const item = candidates.find(candidate => {
    const equipped = getEquippedEntry(player, candidate.slot);
    return equipmentScore(candidate) > equipmentScore(equipped ? ITEMS[equipped.definitionId] : null);
  });
  if (!item) return;
  const result = purchaseEquipment(player, item.definitionId);
  if (result.ok) metrics.goldSpent += result.price;
}

function equipBestOwnedItems(player, metrics, initialWeaponUid) {
  const equipment = player.inventory.filter(entry => ITEMS[entry.definitionId]?.type === "equipment" && canEquipItem(player, entry.uid).ok);
  for (const entry of equipment) {
    const item = ITEMS[entry.definitionId];
    const current = getEquippedEntry(player, item.slot);
    if (current && entry.uid === current.uid) continue;
    if (equipmentScore(item, entry) <= equipmentScore(current ? ITEMS[current.definitionId] : null, current)) continue;
    equipItem(player, entry.uid);
    metrics.improvements.push({ kind: "equipment", at: round(metrics.elapsedSeconds), definitionId: entry.definitionId });
    if (metrics.milestones.firstEquipmentChange == null && player.equipment.weapon !== initialWeaponUid) {
      metrics.milestones.firstEquipmentChange = round(metrics.elapsedSeconds);
    }
  }
}

function reinforceWeapon(player, metrics) {
  const weapon = getEquippedEntry(player, "weapon");
  if (!weapon) return;
  const beforeCoins = player.coins;
  const result = enhanceEquipment(player, weapon.uid);
  if (!result.ok) return;
  metrics.goldSpent += beforeCoins - player.coins;
  metrics.improvements.push({ kind: "forge", at: round(metrics.elapsedSeconds), level: result.level });
  if (metrics.milestones.firstForge == null) metrics.milestones.firstForge = round(metrics.elapsedSeconds);
}

function attackUpgradePrice(player) {
  const config = GAME_CONFIG.economy.attackUpgrade;
  if (player.progression.upgrades.attack >= config.maxPurchases) return Infinity;
  return config.basePrice + player.progression.upgrades.attack * config.priceStep;
}

function equipmentScore(item, entry = null) {
  if (!item) return 0;
  const stats = entry ? calculateItemStats(entry) : item.stats || {};
  return (stats.attack || 0) * 3 + (stats.armor || 0) * 2 + (stats.maxHp || 0) * .18 + (stats.crit || 0) * 1.5 + (stats.moveSpeed || 0) * .12;
}

function normalizeSeed(seed) {
  if (typeof seed === "string") return [...seed].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return (Math.floor(Number(seed) || 1) >>> 0) || 1;
}

function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}
function totalValues(value) { return Object.values(value || {}).reduce((sum, amount) => sum + amount, 0); }
function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}
