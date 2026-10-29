import test from "node:test";
import assert from "node:assert/strict";

import { EQUIPMENT_SLOTS, GAME_CONFIG, ITEMS, SKILLS } from "../js/data.js";
import {
  EXPEDITION_STATES, abandonCaveExpedition, advanceCaveFloor, beginCaveExpedition,
  canSpawnCommonEnemies, createCaveProgress,
  createEncounterSpec, createRegionProgress, createWavePlan, getCaveTier, getFloorFarmConfig,
  finishCaveExit, getFloorAdvanceState, getFloorRule, getFloorUnlockTarget, getRegionConfig, grantEncounterRewards,
  markBossSpawned, prepareExpeditionAfterLoad, recordFloorKill, regionUnlockStatus,
  startNewCaveExpedition, stayOnCompletedFloor
} from "../js/dungeon.js";
import {
  activeEnemyCap, addOwnedProjectile, claimEnemyReward, createFarmRuntime,
  removeOwnedProjectiles, updateFarmSpawner
} from "../js/farm.js";
import { rollLoot } from "../js/loot.js";
import {
  calculateSalePrice, enhanceEquipment, getEnhancementCost, getSaleReturn, purchaseEquipment, sellEquipment
} from "../js/forge.js";
import {
  addInventoryItem, calculateItemStats, calculateStatBreakdown, calculateStats, canEquipItem,
  equipItem, inventoryCount, inventoryUsed, unequipSlot
} from "../js/player.js";
import { grantPlayerExperience, playerExpRequired } from "../js/progression.js";
import { decodeSave, loadGame, SAVE_KEY, saveGame } from "../js/save.js";
import {
  awardMasteryForHit, beginSkill, canUpgradeSkill, cancelSkill, createMasteryTracker,
  createSkillRuntime, getSkillLevel, skillPhaseAt, skillTargetHit, tickSkillRuntime, upgradeSkill
} from "../js/skills.js";
import { createInitialState, createSaveSnapshot, normalizeGameState, validateGameState } from "../js/state.js";
import {
  PROGRESSION_HYPOTHESES, createSeededRandom, simulateCohort, simulateProgression
} from "../js/simulation.js";

class MemoryStorage {
  constructor(entries = {}) { this.data = new Map(Object.entries(entries)); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

const quietLogger = { error() {} };

test("novo jogo nasce no modelo único e válido", () => {
  const state = createInitialState();
  const stats = calculateStats(state.player);
  assert.equal(validateGameState(state).valid, true);
  assert.equal(state.schemaVersion, GAME_CONFIG.save.schemaVersion);
  assert.equal(state.world.scene, "village");
  assert.equal(state.player.progression.kills, 0);
  assert.equal(GAME_CONFIG.combat.playerAttackDuration, .32);
  assert.equal(GAME_CONFIG.combat.dodgeDuration, .2);
  assert.ok(GAME_CONFIG.combat.dodgeCooldown > GAME_CONFIG.combat.dodgeDuration);
  assert.equal(inventoryCount(state.player, "pocao_menor"), 2);
  assert.deepEqual({ attack: stats.attack, armor: stats.armor, maxHp: stats.maxHp }, { attack: 14, armor: 2, maxHp: 100 });
  assert.deepEqual(Object.keys(state.player.equipment), Object.keys(EQUIPMENT_SLOTS));
  assert.equal("damage" in state.player, false);
  assert.equal("potions" in state.player, false);
});

test("save visual v1 migra sem perder atributos e progresso", () => {
  const oldSave = {
    version: 1,
    scene: "cave",
    kills: 9,
    caveVisits: 4,
    sound: false,
    player: {
      name: "Hugo",
      x: 700,
      y: 300,
      hp: 83,
      maxHp: 124,
      level: 4,
      xp: 31,
      nextXp: 201,
      damage: 27,
      armor: 8,
      coins: 144,
      potions: 5,
      damageUpgrades: 3,
      armorUpgrades: 2,
      facing: -1,
      dirX: -1,
      dirY: 0
    }
  };
  const state = decodeSave(JSON.stringify(oldSave), "knightfall.visual.v1");
  const stats = calculateStats(state.player);
  assert.equal(state.player.name, "Hugo");
  assert.equal(state.player.level, 4);
  assert.equal(state.player.xp, 31);
  assert.equal(state.player.hp, 83);
  assert.equal(stats.maxHp, 124);
  assert.equal(stats.attack, 27);
  assert.equal(stats.armor, 8);
  assert.equal(state.player.coins, 144);
  assert.equal(state.player.progression.kills, 9);
  assert.deepEqual(state.player.progression.upgrades, { attack: 3, armor: 2 });
  assert.equal(inventoryCount(state.player, "pocao_menor"), 5);
  assert.equal(state.world.caveVisits, 4);
  assert.equal(state.settings.audioEnabled, false);
});

test("save legado envelopado preserva inventário, equipamento, atributos e mundo", () => {
  const oldState = {
    player: {
      name: "Mara",
      originId: "mercenario",
      level: 6,
      xp: 22,
      hp: 130,
      maxHp: 150,
      coins: 91,
      attributes: { for: 9, des: 5, con: 7, int: 5, esp: 5, sor: 5 },
      equipment: { weapon: "blade-1", armor: null, helmet: null, charm: null, boots: null },
      skills: ["golpe_poderoso", "corte_preciso"],
      bag: { purchasedSlots: 3 }
    },
    inventory: [
      { uid: "blade-1", itemId: "espada_gasta", quantity: 1, level: 2 },
      { uid: "potion-1", itemId: "pocao_menor", quantity: 4 }
    ],
    world: {
      currentArea: "cavernas_sussurro",
      regionProgress: { cavernas_sussurro: 3 },
      bossesDefeated: { guardiao_ruinas: 1 },
      bossPity: {}
    },
    settings: { musicEnabled: false }
  };
  const payload = { game: "KnightFall", version: 7, state: oldState };
  const state = decodeSave(JSON.stringify(payload), "ecosDoAbismo.save");
  assert.equal(state.player.name, "Mara");
  assert.equal(state.player.attributes.for, 9);
  assert.equal(state.player.equipment.weapon, "blade-1");
  assert.equal(state.player.inventory.length, 2);
  assert.equal(inventoryCount(state.player, "pocao_menor"), 4);
  assert.equal("currentArea" in state.world, false);
  assert.equal(state.world.regionProgress.caverna_sombria.highestUnlockedFloor, 1);
  assert.equal(state.world.regionProgress.bosque_cinzas.highestUnlockedFloor, 1);
  assert.equal(state.settings.audioEnabled, false);
});

test("loader ignora save primário corrompido, registra erro e usa legado válido", () => {
  const visual = {
    version: 1,
    scene: "village",
    player: { name: "Fallback", level: 2, hp: 70, maxHp: 100, damage: 14, armor: 3, coins: 20, potions: 1 }
  };
  const messages = [];
  const storage = new MemoryStorage({
    [SAVE_KEY]: "{json quebrado",
    "knightfall.visual.v1": JSON.stringify(visual)
  });
  const state = loadGame({ storage, logger: { error: (...args) => messages.push(args) } });
  assert.equal(state.player.name, "Fallback");
  assert.equal(messages.length, 1);
});

test("save atual faz round-trip e preserva uma incursão ativa", () => {
  const storage = new MemoryStorage();
  const original = createInitialState({ name: "Aldric Teste" });
  const expedition = startNewCaveExpedition(original.world.regionProgress.caverna_sombria, GAME_CONFIG.firstCave, { id: "save-active" });
  original.world.scene = "cave";
  original.player.x = 800;
  original.player.y = 160;
  original.player.coins = 321;
  original.player.progression.kills = 12;
  assert.equal(saveGame(original, { storage, logger: quietLogger }), true);
  const restored = loadGame({ storage, logger: quietLogger });
  assert.equal(validateGameState(restored).valid, true);
  assert.equal(restored.player.name, "Aldric Teste");
  assert.equal(restored.player.coins, 321);
  assert.equal(restored.player.progression.kills, 12);
  assert.equal(restored.world.scene, "cave");
  assert.deepEqual({ x: restored.player.x, y: restored.player.y }, { x: 800, y: 160 });
  assert.equal(restored.world.regionProgress.caverna_sombria.expedition.id, expedition.id);
});

test("normalização limita valores inválidos e progressão usa a curva central", () => {
  const state = normalizeGameState({
    player: {
      name: "   ",
      level: -10,
      xp: -50,
      hp: 999999999,
      maxHp: 100,
      coins: -2,
      potions: -7
    },
    systems: {
      trainingSession: { active: true, weaponType: "laser", startedAt: "ontem" },
      autoFarmSession: { active: true, regionId: "inexistente", startedAt: 1 },
      autoFarmSettings: { potionThreshold: 9, autoPotion: "sim" }
    }
  });
  assert.equal(state.player.name, GAME_CONFIG.player.defaultName);
  assert.equal(state.player.level, 1);
  assert.equal(state.player.xp, 0);
  assert.equal(state.player.coins, 0);
  assert.equal(state.player.hp, calculateStats(state.player).maxHp);
  assert.equal(inventoryCount(state.player, "pocao_menor"), 0);
  assert.equal("systems" in state, false);

  const needed = playerExpRequired(1);
  const skillPointsBefore = state.player.skillProgression.points;
  const result = grantPlayerExperience(state.player, needed);
  assert.equal(result.levels, 1);
  assert.equal(state.player.level, 2);
  assert.equal(state.player.baseStats.maxHp, 112);
  assert.equal(state.player.baseStats.attack, 14);
  assert.equal(state.player.skillProgression.points, skillPointsBefore);
  grantPlayerExperience(state.player, playerExpRequired(2));
  assert.equal(state.player.level, 3);
  assert.equal(state.player.skillProgression.points, skillPointsBefore + 1);
});

test("equipamento altera apenas o atributo derivado, sem duplicar o ataque base", () => {
  const state = createInitialState();
  assert.equal(addInventoryItem(state.player, "espada_gasta"), true);
  const weapon = state.player.inventory.find(entry => entry.definitionId === "espada_gasta");
  assert.equal(equipItem(state.player, weapon.uid).ok, true);
  assert.equal(equipItem(state.player, weapon.uid).ok, true);
  assert.equal(state.player.baseStats.attack, 12);
  assert.equal(calculateStats(state.player).attack, 16);
  assert.equal(calculateStatBreakdown(state.player).equipment.attack, 4);
  assert.equal(unequipSlot(state.player, "weapon").ok, true);
  assert.equal(calculateStats(state.player).attack, 12);
});

test("requisitos de nível impedem equipamento e comparação usa a instância", () => {
  const state = createInitialState();
  assert.equal(addInventoryItem(state.player, "espada_ferro"), true);
  const iron = state.player.inventory.find(entry => entry.definitionId === "espada_ferro");
  assert.deepEqual(canEquipItem(state.player, iron.uid), { ok: false, reason: "Requer nível 2." });
  state.player.level = 2;
  assert.equal(equipItem(state.player, iron.uid).ok, true);
  assert.equal(calculateItemStats(iron).attack, 7);
  assert.equal(calculateStats(state.player).attack, 19);
});

test("inventário cheio recusa novas pilhas e equipamentos, mas amplia pilha existente", () => {
  const state = createInitialState();
  state.player.bag.capacity = inventoryUsed(state.player);
  assert.equal(addInventoryItem(state.player, "capacete_ferro"), false);
  assert.equal(addInventoryItem(state.player, "fragmento_ferro"), false);
  assert.equal(addInventoryItem(state.player, "pocao_menor", 2), true);
  assert.equal(inventoryCount(state.player, "pocao_menor"), 4);
  assert.equal(inventoryUsed(state.player), state.player.bag.capacity);
});

test("equipamento e inventário persistem ao salvar e recarregar", () => {
  const storage = new MemoryStorage();
  const state = createInitialState();
  state.player.level = 2;
  addInventoryItem(state.player, "capacete_ferro");
  const helmet = state.player.inventory.find(entry => entry.definitionId === "capacete_ferro");
  equipItem(state.player, helmet.uid);
  assert.equal(saveGame(state, { storage, logger: quietLogger }), true);
  const restored = loadGame({ storage, logger: quietLogger });
  assert.equal(restored.player.equipment.helmet, helmet.uid);
  assert.equal(restored.player.inventory.find(entry => entry.uid === helmet.uid).definitionId, "capacete_ferro");
  assert.equal(calculateStats(restored.player).armor, 4);
});

test("save v2 migra itemId, level e slots antigos para o schema atual", () => {
  const legacy = createInitialState();
  legacy.schemaVersion = 2;
  legacy.player.inventory = [
    { uid: "old-armor", itemId: "armadura_couro", quantity: 1, level: 3 },
    { uid: "old-charm", itemId: "anel_agilidade", quantity: 1, level: 1 }
  ];
  legacy.player.equipment = { weapon: null, armor: "old-armor", helmet: null, charm: "old-charm", boots: null };
  const payload = { game: GAME_CONFIG.save.gameId, version: 2, state: legacy };
  const migrated = decodeSave(JSON.stringify(payload), SAVE_KEY);
  assert.equal(migrated.schemaVersion, GAME_CONFIG.save.schemaVersion);
  assert.equal(migrated.player.equipment.chest, "old-armor");
  assert.equal(migrated.player.equipment.ring, "old-charm");
  assert.equal(migrated.player.inventory[0].enhancementLevel, 2);
  assert.equal(migrated.player.inventory[0].definitionId, "armadura_couro");
});

test("loot respeita nível mínimo e usa fonte aleatória injetável", () => {
  const table = [
    { definitionId: "espada_curta", chance: .5 },
    { definitionId: "espada_ferro", chance: 1, minimumEnemyLevel: 2 }
  ];
  assert.deepEqual(rollLoot(table, 1, () => .25).map(drop => drop.definitionId), ["espada_curta"]);
  assert.deepEqual(rollLoot(table, 2, () => .75).map(drop => drop.definitionId), ["espada_ferro"]);
});

test("loot limita equipamentos a uma peça por inimigo", () => {
  const table = [
    { definitionId: "espada_curta", chance: 1 },
    { definitionId: "espada_ferro", chance: 1 },
    { definitionId: "fragmento_ferro", chance: 1 }
  ];
  const drops = rollLoot(table, 10, () => 0);
  assert.equal(drops.filter(drop => ITEMS[drop.definitionId].type === "equipment").length, 1);
  assert.equal(drops.some(drop => drop.definitionId === "fragmento_ferro"), true);
});

test("loot inicial mantém equipamentos raros durante uma sessão curta de farm", () => {
  const random = createSeededRandom(92741);
  const equipmentPerSession = [];
  for (let session = 0; session < 1000; session += 1) {
    let equipment = 0;
    for (let kill = 0; kill < 24; kill += 1) {
      equipment += rollLoot(getCaveTier(1).loot, 1, random)
        .filter(drop => ITEMS[drop.definitionId].type === "equipment").length;
    }
    equipmentPerSession.push(equipment);
  }
  equipmentPerSession.sort((left, right) => left - right);
  assert.ok(equipmentPerSession[499] <= 1, `mediana: ${equipmentPerSession[499]}`);
  assert.ok(equipmentPerSession[949] <= 3, `p95: ${equipmentPerSession[949]}`);
});

test("as faixas dos 10 andares selecionam arquétipos e chefe explicitamente", () => {
  assert.equal(getCaveTier(1).archetype, "common");
  assert.equal(getCaveTier(3).archetype, "common");
  assert.equal(getCaveTier(4).archetype, "warrior");
  assert.equal(getCaveTier(6).archetype, "warrior");
  assert.equal(getCaveTier(7).archetype, "archer");
  assert.equal(getCaveTier(8).archetype, "archer");
  assert.equal(getCaveTier(9).archetype, "elite");
  assert.equal(getCaveTier(10).archetype, "elite");
  assert.equal(createEncounterSpec(10).boss, false);
  assert.equal(createEncounterSpec(10, GAME_CONFIG.firstCave, "boss").boss, true);
});

test("andar da incursão e maior andar desbloqueado evoluem separadamente", () => {
  const progress = createCaveProgress();
  assert.equal(beginCaveExpedition(progress), 1);
  const target = getFloorUnlockTarget(1);
  for (let kill = 1; kill < target; kill += 1) recordFloorKill(progress, 1);
  assert.equal(progress.highestUnlockedFloor, 1);
  const unlocked = recordFloorKill(progress, 1);
  assert.equal(unlocked.unlocked, true);
  assert.equal(progress.highestUnlockedFloor, 2);
  assert.equal(progress.selectedFloor, 1);
  assert.equal(advanceCaveFloor(progress, 1).ok, true);
  assert.equal(progress.expedition.floor, 2);
  assert.equal(progress.highestUnlockedFloor, 2);
  abandonCaveExpedition(progress);
  assert.equal(progress.selectedFloor, 2);
  assert.equal(progress.highestUnlockedFloor, 2);
});

test("avanço dentro da caverna só fica disponível após a meta permanente", () => {
  const progress = createCaveProgress();
  beginCaveExpedition(progress);
  assert.equal(getFloorAdvanceState(progress, 1).available, false);
  for (let kill = 0; kill < getFloorUnlockTarget(1); kill += 1) recordFloorKill(progress, 1);
  const unlocked = getFloorAdvanceState(progress, 1);
  assert.deepEqual({ completed: unlocked.completed, available: unlocked.available, nextFloor: unlocked.nextFloor }, { completed: true, available: true, nextFloor: 2 });
  assert.equal(advanceCaveFloor(progress, 1).ok, true);
  assert.equal(progress.expedition.floor, 2);
});

test("a recompensa única do Rei Goblin só é concedida uma vez", () => {
  const progress = createCaveProgress({ highestUnlockedFloor: 10 });
  const boss = createEncounterSpec(10, GAME_CONFIG.firstCave, "boss");
  const first = grantEncounterRewards(progress, boss, () => 0);
  const repeat = grantEncounterRewards(progress, boss, () => 0);
  assert.equal(first.firstVictory.items[0].definitionId, "coroa_rei_goblin");
  assert.equal(repeat.firstVictory, null);
  assert.equal(progress.uniqueRewardsClaimed.goblinKingFirstVictory, true);
});

test("Bosque das Cinzas desbloqueia somente após a derrota do Rei Goblin", () => {
  const state = createInitialState();
  assert.deepEqual(regionUnlockStatus(state.world, "caverna_sombria"), { unlocked: true, reason: "" });
  assert.equal(regionUnlockStatus(state.world, "bosque_cinzas").unlocked, false);
  state.world.regionProgress.caverna_sombria.bossVictories = 1;
  assert.deepEqual(regionUnlockStatus(state.world, "bosque_cinzas"), { unlocked: true, reason: "" });
  assert.equal(regionUnlockStatus(state.world, "montanhas_lamento").unlocked, false);
});

test("segunda região possui dez estágios, comportamentos e chefe configurados", () => {
  const grove = getRegionConfig("bosque_cinzas");
  assert.equal(grove.totalFloors, 10);
  assert.equal(createEncounterSpec(1, grove).visual.species, "raven");
  assert.equal(createEncounterSpec(2, grove).visual.species, "wolf");
  assert.equal(getCaveTier(4, grove).ai.pattern, "ash_bolt");
  assert.deepEqual(getCaveTier(8, grove).ai.patterns, ["heavy", "area"]);
  const boss = createEncounterSpec(10, grove, "boss");
  assert.equal(boss.boss, true);
  assert.equal(boss.name, "Cervo-Rei Putrificado");
  assert.deepEqual(boss.ai.patterns, ["heavy", "charge", "area"]);
});

test("progresso e recompensa única permanecem independentes por região", () => {
  const state = createInitialState();
  const cave = state.world.regionProgress.caverna_sombria;
  const grove = state.world.regionProgress.bosque_cinzas;
  beginCaveExpedition(cave, GAME_CONFIG.firstCave);
  for (let kill = 0; kill < getFloorUnlockTarget(1); kill += 1) recordFloorKill(cave, 1, GAME_CONFIG.firstCave);
  advanceCaveFloor(cave, 1, GAME_CONFIG.firstCave);
  assert.equal(cave.highestUnlockedFloor, 2);
  assert.equal(grove.highestUnlockedFloor, 1);

  const boss = createEncounterSpec(10, GAME_CONFIG.ashenGrove, "boss");
  const first = grantEncounterRewards(grove, boss, () => 0);
  const repeated = grantEncounterRewards(grove, boss, () => 0);
  assert.equal(first.firstVictory.items[0].definitionId, "coroa_cervo");
  assert.equal(repeated.firstVictory, null);
  assert.equal(cave.uniqueRewardsClaimed.rottenStagFirstVictory, undefined);
});

test("save preserva região selecionada e progressos regionais sem misturá-los", () => {
  const state = createInitialState();
  state.world.currentRegionId = "bosque_cinzas";
  state.world.regionProgress.caverna_sombria.bossVictories = 1;
  state.world.regionProgress.caverna_sombria.highestUnlockedFloor = 10;
  state.world.regionProgress.bosque_cinzas.highestUnlockedFloor = 4;
  const restored = normalizeGameState(structuredClone(state));
  assert.equal(restored.world.currentRegionId, "bosque_cinzas");
  assert.equal(restored.world.regionProgress.caverna_sombria.highestUnlockedFloor, 10);
  assert.equal(restored.world.regionProgress.bosque_cinzas.highestUnlockedFloor, 4);
});

test("progresso da caverna persiste e saves antigos recebem migração segura", () => {
  const storage = new MemoryStorage();
  const state = createInitialState();
  const cave = state.world.regionProgress.caverna_sombria;
  const expedition = startNewCaveExpedition(cave, GAME_CONFIG.firstCave, { id: "persist-expedition" });
  for (let kill = 0; kill < 3; kill += 1) recordFloorKill(cave, 1, GAME_CONFIG.firstCave, { expeditionId: expedition.id });
  assert.equal(saveGame(state, { storage, logger: quietLogger }), true);
  const restored = loadGame({ storage, logger: quietLogger });
  assert.equal(restored.world.regionProgress.caverna_sombria.expedition.id, "persist-expedition");
  assert.equal(restored.world.regionProgress.caverna_sombria.expedition.floorKills[1], 3);

  const versionThree = createInitialState();
  versionThree.schemaVersion = 3;
  versionThree.player.progression.kills = 8;
  versionThree.world.caveProgress = { highestUnlockedFloor: 9, currentExpeditionFloor: null };
  delete versionThree.world.regionProgress;
  const migrated = decodeSave(JSON.stringify({ game: GAME_CONFIG.save.gameId, version: 3, state: versionThree }), SAVE_KEY);
  assert.equal(migrated.world.regionProgress.caverna_sombria.highestUnlockedFloor, 9);
  assert.equal(migrated.world.regionProgress.caverna_sombria.expedition, null);
  assert.equal(migrated.world.regionProgress.bosque_cinzas.highestUnlockedFloor, 1);
});

test("save v6 migra para v9 sem perder personagem, equipamento ou histórico", () => {
  const legacy = createInitialState();
  legacy.schemaVersion = 6;
  legacy.player.level = 7;
  legacy.player.xp = 91;
  legacy.player.coins = 777;
  legacy.world.bossesDefeated = { rei_goblin: 1 };
  legacy.world.bossPity = { rei_goblin: 8 };
  legacy.world.currentArea = "cavernas_sussurro";
  legacy.systems = { autoFarmSession: { active: true }, trainingSession: { active: true } };
  legacy.world.regionProgress.caverna_sombria = {
    highestUnlockedFloor: 8,
    currentExpeditionFloor: 5,
    floorCompletions: { 1: 1, 7: 1 },
    bossVictories: 0,
    uniqueRewardsClaimed: {}
  };
  const weaponUid = legacy.player.equipment.weapon;
  const payload = { game: GAME_CONFIG.save.gameId, version: 6, state: legacy };
  const migrated = decodeSave(JSON.stringify(payload), SAVE_KEY);
  const cave = migrated.world.regionProgress.caverna_sombria;
  assert.equal(migrated.schemaVersion, 9);
  assert.equal(migrated.player.level, 7);
  assert.equal(migrated.player.xp, 91);
  assert.equal(migrated.player.coins, 777);
  assert.equal(migrated.player.equipment.weapon, weaponUid);
  assert.equal(cave.highestUnlockedFloor, 8);
  assert.equal(cave.selectedFloor, 5);
  assert.equal(cave.bossVictories, 1);
  assert.equal(cave.expedition, null);
  assert.equal("bossesDefeated" in migrated.world, false);
  assert.equal("bossPity" in migrated.world, false);
  assert.equal("currentArea" in migrated.world, false);
  assert.equal("systems" in migrated, false);
  assert.equal(cave.floorCompletions[7], 1);
});

test("ondas respeitam orçamento, limite ativo, IDs únicos e respawn contínuo", () => {
  const runtime = createFarmRuntime("caverna_sombria", 1, GAME_CONFIG.firstCave, { id: "farm-test" });
  const random = () => .25;
  const first = updateFarmSpawner(runtime, 0, 0, random);
  assert.ok(first);
  const second = updateFarmSpawner(runtime, 1, 1, random);
  assert.ok(second);
  assert.notEqual(first.id, second.id);
  assert.equal(updateFarmSpawner(runtime, 1, activeEnemyCap(runtime), random), null);
  runtime.spawnQueue.length = 0;
  assert.equal(updateFarmSpawner(runtime, 0, 0, random), null);
  const respawned = updateFarmSpawner(runtime, GAME_CONFIG.firstCave.farm.waveBreak + .1, 0, random);
  assert.ok(respawned);
  assert.ok(runtime.waveIndex >= 2);
  const plan = createWavePlan(9, GAME_CONFIG.firstCave, random);
  assert.ok(plan.length >= getFloorFarmConfig(9).waveSize[0]);
  assert.ok(plan.length <= getFloorFarmConfig(9).waveSize[1]);
});

test("recompensas e projéteis são independentes por inimigo", () => {
  const runtime = createFarmRuntime("caverna_sombria", 8, GAME_CONFIG.firstCave, { id: "ownership-test" });
  assert.equal(claimEnemyReward(runtime, "enemy-a"), true);
  assert.equal(claimEnemyReward(runtime, "enemy-a"), false);
  assert.equal(claimEnemyReward(runtime, "enemy-b"), true);
  const projectiles = [];
  assert.equal(addOwnedProjectile(projectiles, { id: "arrow-a", ownerId: "enemy-a" }, 2), true);
  assert.equal(addOwnedProjectile(projectiles, { id: "arrow-b", ownerId: "enemy-b" }, 2), true);
  assert.equal(addOwnedProjectile(projectiles, { id: "arrow-c", ownerId: "enemy-c" }, 2), false);
  assert.equal(removeOwnedProjectiles(projectiles, "enemy-a"), 1);
  assert.deepEqual(projectiles.map(projectile => projectile.ownerId), ["enemy-b"]);
});

test("as duas regiões jogáveis possuem ondas contínuas independentes", () => {
  const runtime = createFarmRuntime("bosque_cinzas", 1, GAME_CONFIG.ashenGrove, { id: "grove-test" });
  const first = updateFarmSpawner(runtime, 0, 0, () => .5);
  assert.ok(first);
  assert.equal(runtime.waveIndex, 1);
  runtime.spawnQueue.length = 0;
  const respawned = updateFarmSpawner(runtime, 30, 0, () => .5);
  assert.ok(respawned);
  assert.equal(runtime.waveIndex, 2);
});

test("snapshot preserva incursão ativa e morte grava retorno seguro à vila", () => {
  const state = createInitialState();
  const cave = state.world.regionProgress.caverna_sombria;
  const expedition = startNewCaveExpedition(cave, GAME_CONFIG.firstCave, { id: "death-expedition" });
  recordFloorKill(cave, 1, GAME_CONFIG.firstCave, { expeditionId: expedition.id });
  state.world.scene = "cave";
  const activeSnapshot = createSaveSnapshot(state);
  assert.equal(activeSnapshot.world.scene, "cave");
  assert.equal(activeSnapshot.world.regionProgress.caverna_sombria.expedition.floorKills[1], 1);
  state.player.hp = 0;
  const deathSnapshot = createSaveSnapshot(state);
  assert.equal(deathSnapshot.world.scene, "village");
  assert.equal(deathSnapshot.world.regionProgress.caverna_sombria.expedition.id, "death-expedition");
});

test("boss repetível contabiliza vitórias sem repetir recompensa única", () => {
  const progress = createCaveProgress({ highestUnlockedFloor: 10 });
  const boss = createEncounterSpec(10, GAME_CONFIG.firstCave, "boss");
  const prepareBoss = expeditionId => {
    const expedition = startNewCaveExpedition(progress, GAME_CONFIG.firstCave, { id: expeditionId });
    expedition.floor = 10;
    expedition.state = EXPEDITION_STATES.BOSS_PREPARATION;
    progress.selectedFloor = 10;
    for (let kill = 0; kill < getFloorUnlockTarget(10); kill += 1) {
      recordFloorKill(progress, 10, GAME_CONFIG.firstCave, { expeditionId });
    }
    assert.equal(markBossSpawned(progress).ok, true);
    return expedition;
  };
  const firstExpedition = prepareBoss("boss-run-1");
  const firstReward = grantEncounterRewards(progress, boss, () => 0);
  recordFloorKill(progress, 10, GAME_CONFIG.firstCave, { boss: true, expeditionId: firstExpedition.id });
  assert.equal(recordFloorKill(progress, 10, GAME_CONFIG.firstCave, { boss: true, expeditionId: firstExpedition.id }).counted, false);
  const secondExpedition = prepareBoss("boss-run-2");
  const repeatedReward = grantEncounterRewards(progress, boss, () => 0);
  recordFloorKill(progress, 10, GAME_CONFIG.firstCave, { boss: true, expeditionId: secondExpedition.id });
  assert.ok(firstReward.firstVictory);
  assert.equal(repeatedReward.firstVictory, null);
  assert.equal(progress.bossVictories, 2);
  assert.equal(progress.floorObjectivesCompleted[10], true);
});

test("limite de Bram bloqueia novas compras sem reduzir poder legado", () => {
  const state = createInitialState();
  state.player.progression.upgrades.attack = 12;
  state.player.baseStats.attack += 36;
  const normalized = normalizeGameState(state);
  assert.equal(normalized.player.progression.upgrades.attack, 12);
  assert.equal(normalized.player.baseStats.attack, 48);
  assert.equal(GAME_CONFIG.economy.attackUpgrade.maxPurchases, 8);
  assert.equal(GAME_CONFIG.economy.armorUpgrade.maxPurchases, 8);
});

test("metas e ondas dos 10 andares seguem exatamente a tabela de incursão", () => {
  const kills = [8, 9, 10, 11, 12, 13, 14, 15, 16, 20];
  const waveSizes = [[2, 3], [2, 3], [3, 4], [3, 4], [3, 4], [4, 5], [4, 5], [4, 5], [5, 6], [5, 6]];
  assert.deepEqual(Array.from({ length: 10 }, (_, index) => getFloorUnlockTarget(index + 1)), kills);
  assert.equal(kills.reduce((sum, amount) => sum + amount, 0), 128);
  assert.deepEqual(Array.from({ length: 10 }, (_, index) => getFloorRule(index + 1).waveSize), waveSizes);
});

test("multiplicadores de andar são aplicados uma vez sem alterar atributos-base", () => {
  const commonTier = getCaveTier(1);
  const eliteTier = getCaveTier(10);
  const originalCommon = structuredClone(commonTier.stats);
  const originalElite = structuredClone(eliteTier.stats);
  const floorOne = createEncounterSpec(1, GAME_CONFIG.firstCave, "common");
  const floorTen = createEncounterSpec(10, GAME_CONFIG.firstCave, "elite");
  const repeated = createEncounterSpec(10, GAME_CONFIG.firstCave, "elite");
  assert.deepEqual({ hp: floorOne.hp, attack: floorOne.attack, defense: floorOne.defense }, { hp: 42, attack: 8, defense: 1 });
  assert.deepEqual({ hp: floorTen.hp, attack: floorTen.attack, defense: floorTen.defense }, { hp: 292, attack: 32, defense: 4 });
  assert.deepEqual(repeated, floorTen);
  assert.deepEqual(commonTier.stats, originalCommon);
  assert.deepEqual(eliteTier.stats, originalElite);
});

test("somente mortes da cave, incursão e andar atuais contam para a meta", () => {
  const progress = createCaveProgress();
  const expedition = startNewCaveExpedition(progress, GAME_CONFIG.firstCave, { id: "valid-kills" });
  assert.equal(recordFloorKill(progress, 1, GAME_CONFIG.firstCave, { expeditionId: "stale" }).counted, false);
  assert.equal(recordFloorKill(progress, 2, GAME_CONFIG.firstCave, { expeditionId: expedition.id }).counted, false);
  assert.equal(recordFloorKill(progress, 1, GAME_CONFIG.firstCave, { expeditionId: expedition.id, regionId: "bosque_cinzas" }).counted, false);
  assert.equal(recordFloorKill(progress, 1, GAME_CONFIG.firstCave, { expeditionId: expedition.id, regionId: "caverna_sombria" }).counted, true);
  assert.equal(expedition.floorKills[1], 1);
});

test("permanecer mantém a conclusão, reativa o farm e preserva o avanço", () => {
  const progress = createCaveProgress();
  const expedition = startNewCaveExpedition(progress, GAME_CONFIG.firstCave, { id: "stay-run" });
  for (let kill = 0; kill < getFloorUnlockTarget(1); kill += 1) {
    recordFloorKill(progress, 1, GAME_CONFIG.firstCave, { expeditionId: expedition.id });
  }
  assert.equal(expedition.state, EXPEDITION_STATES.FLOOR_COMPLETED);
  assert.equal(canSpawnCommonEnemies(progress), false);
  assert.equal(stayOnCompletedFloor(progress).ok, true);
  assert.equal(expedition.state, EXPEDITION_STATES.FARMING);
  assert.equal(canSpawnCommonEnemies(progress), true);
  assert.equal(recordFloorKill(progress, 1, GAME_CONFIG.firstCave, { expeditionId: expedition.id }).farmOnly, true);
  assert.equal(expedition.floorKills[1], 8);
  assert.equal(expedition.farmKills[1], 1);
  assert.equal(getFloorAdvanceState(progress, 1).available, true);
});

test("andar 10 exige 20 mortes, espera ameaças restantes e invoca um único boss", () => {
  const progress = createCaveProgress({ highestUnlockedFloor: 10 });
  const expedition = startNewCaveExpedition(progress, GAME_CONFIG.firstCave, { id: "boss-gate" });
  expedition.floor = 10;
  expedition.state = EXPEDITION_STATES.BOSS_PREPARATION;
  progress.selectedFloor = 10;
  assert.equal(markBossSpawned(progress).ok, false);
  for (let kill = 0; kill < 19; kill += 1) {
    recordFloorKill(progress, 10, GAME_CONFIG.firstCave, { expeditionId: expedition.id });
  }
  assert.equal(expedition.state, EXPEDITION_STATES.BOSS_PREPARATION);
  const twentieth = recordFloorKill(progress, 10, GAME_CONFIG.firstCave, { expeditionId: expedition.id });
  assert.equal(twentieth.bossUnlocked, true);
  assert.equal(expedition.state, EXPEDITION_STATES.BOSS_PENDING);
  assert.equal(canSpawnCommonEnemies(progress), false);
  assert.equal(markBossSpawned(progress, GAME_CONFIG.firstCave, { activeCommonCount: 2 }).ok, false);
  assert.equal(markBossSpawned(progress, GAME_CONFIG.firstCave, { activeCommonCount: 0 }).ok, true);
  assert.equal(markBossSpawned(progress).ok, false);
  assert.equal(expedition.state, EXPEDITION_STATES.BOSS_ACTIVE);
});

test("derrota do boss encerra spawns, impede andar 11 e exige nova incursão", () => {
  const progress = createCaveProgress({ highestUnlockedFloor: 10 });
  const expedition = startNewCaveExpedition(progress, GAME_CONFIG.firstCave, { id: "complete-run" });
  expedition.floor = 10;
  expedition.state = EXPEDITION_STATES.BOSS_PENDING;
  expedition.bossUnlocked = true;
  progress.selectedFloor = 10;
  assert.equal(markBossSpawned(progress).ok, true);
  const defeated = recordFloorKill(progress, 10, GAME_CONFIG.firstCave, { boss: true, expeditionId: expedition.id });
  assert.equal(defeated.caveCompleted, true);
  assert.equal(expedition.state, EXPEDITION_STATES.CAVE_COMPLETED);
  assert.equal(canSpawnCommonEnemies(progress), false);
  assert.equal(advanceCaveFloor(progress, 10).ok, false);
  assert.equal(markBossSpawned(progress).ok, false);
  assert.equal(finishCaveExit(progress), true);
  assert.equal(progress.expedition, null);
  const next = startNewCaveExpedition(progress, GAME_CONFIG.firstCave, { id: "next-run" });
  assert.equal(next.floor, 1);
  assert.deepEqual(next.floorKills, {});
  assert.equal(next.bossUnlocked, false);
});

test("estados da incursão persistem e boss ativo é rearmado com segurança", () => {
  const base = createCaveProgress();
  const expedition = startNewCaveExpedition(base, GAME_CONFIG.firstCave, { id: "restore-run" });
  for (let kill = 0; kill < getFloorUnlockTarget(1); kill += 1) recordFloorKill(base, 1, GAME_CONFIG.firstCave, { expeditionId: expedition.id });
  const floorCompleted = createRegionProgress(structuredClone(base), GAME_CONFIG.firstCave);
  assert.equal(floorCompleted.expedition.state, EXPEDITION_STATES.FLOOR_COMPLETED);
  assert.equal(floorCompleted.expedition.floorKills[1], 8);

  expedition.floor = 10;
  expedition.state = EXPEDITION_STATES.BOSS_ACTIVE;
  expedition.bossUnlocked = true;
  expedition.bossSpawned = true;
  const activeBoss = createRegionProgress(structuredClone(base), GAME_CONFIG.firstCave);
  prepareExpeditionAfterLoad(activeBoss);
  assert.equal(activeBoss.expedition.state, EXPEDITION_STATES.BOSS_PENDING);
  assert.equal(activeBoss.expedition.bossSpawned, false);
  assert.equal(markBossSpawned(activeBoss).ok, true);

  // Sair, morrer ou recarregar descarrega entidades. A reentrada rearma a
  // mesma incursão sem conservar uma instância fantasma do chefe.
  prepareExpeditionAfterLoad(activeBoss);
  assert.equal(activeBoss.expedition.state, EXPEDITION_STATES.BOSS_PENDING);
  assert.equal(activeBoss.expedition.bossSpawned, false);

  activeBoss.expedition.bossDefeated = true;
  activeBoss.expedition.completed = true;
  const completed = createRegionProgress(structuredClone(activeBoss), GAME_CONFIG.firstCave);
  assert.equal(completed.expedition.state, EXPEDITION_STATES.CAVE_COMPLETED);
  assert.equal(canSpawnCommonEnemies(completed), false);
});

test("configuração e loot de chefes permanecem independentes e imutáveis", () => {
  const goblinBoss = createEncounterSpec(10, GAME_CONFIG.firstCave, "boss");
  const stagBoss = createEncounterSpec(10, GAME_CONFIG.ashenGrove, "boss");
  assert.deepEqual(goblinBoss.loot, [
    { definitionId: "pocao_maior", chance: .35 },
    { definitionId: "anel_vitalidade", chance: .06 },
    { definitionId: "amuleto_vigia", chance: .07 },
    { definitionId: "fragmento_aco", chance: .65 },
    { definitionId: "essencia", chance: 1 },
    { definitionId: "cristal_raro", chance: .16 }
  ]);
  assert.deepEqual(stagBoss.loot, [
    { definitionId: "seiva_corrompida", chance: 1 },
    { definitionId: "cinza_viva", chance: 1 },
    { definitionId: "espada_cinzas", chance: .22 },
    { definitionId: "cristal_raro", chance: .2 }
  ]);
  assert.deepEqual(goblinBoss.rewards, { xpBase: 240, xpPerFloor: 0, coinsBase: 45, coinsPerFloor: 0, coinVariance: 12, multiplier: 1.35 });
  assert.deepEqual(goblinBoss.firstVictory, { xp: 220, coins: 80, items: [{ definitionId: "coroa_rei_goblin", quantity: 1 }] });
  assert.deepEqual(stagBoss.rewards, { xpBase: 360, xpPerFloor: 0, coinsBase: 125, coinsPerFloor: 0, coinVariance: 30, multiplier: 1.7 });
  assert.deepEqual(stagBoss.firstVictory, { xp: 300, coins: 190, items: [{ definitionId: "coroa_cervo", quantity: 1 }] });
  assert.notEqual(goblinBoss.loot, stagBoss.loot);
  const firstCommon = createEncounterSpec(10, GAME_CONFIG.firstCave, "common");
  assert.ok(goblinBoss.hp >= firstCommon.hp * 5 && goblinBoss.hp <= firstCommon.hp * 8);
  assert.ok(goblinBoss.attack >= firstCommon.attack * 1.4 && goblinBoss.attack <= firstCommon.attack * 1.8);
});

function fundForge(player) {
  player.coins = 10000;
  for (const definitionId of ["fragmento_ferro", "fragmento_aco", "essencia", "seiva_corrompida", "cinza_viva", "cristal_raro"]) {
    assert.equal(addInventoryItem(player, definitionId, 100), true);
  }
}

test("todo material da forja possui fonte configurada e utilização real", () => {
  const materialIds = ["fragmento_ferro", "fragmento_aco", "essencia", "seiva_corrompida", "cinza_viva", "cristal_raro"];
  const sourcedMaterials = new Set([GAME_CONFIG.firstCave, GAME_CONFIG.ashenGrove].flatMap(region => region.tiers.flatMap(tier => tier.loot.map(drop => drop.definitionId))));
  const usedMaterials = new Set(Object.values(GAME_CONFIG.forge.costs).flatMap(cost => Object.keys(cost.materials)));

  for (const definitionId of materialIds) {
    assert.equal(sourcedMaterials.has(definitionId), true, `${definitionId} precisa de uma fonte de obtenção`);
    assert.equal(usedMaterials.has(definitionId), true, `${definitionId} precisa ser usado pela forja`);
  }
});

test("forja reforça uma instância de +0 até +10 com custos crescentes", () => {
  const state = createInitialState();
  fundForge(state.player);
  const weapon = state.player.inventory.find(entry => entry.definitionId === "espada_enferrujada");
  let previousGoldCost = 0;
  for (let target = 1; target <= GAME_CONFIG.forge.maxLevel; target += 1) {
    const cost = getEnhancementCost(weapon);
    assert.equal(cost.targetLevel, target);
    assert.ok(cost.gold > previousGoldCost);
    previousGoldCost = cost.gold;
    const result = enhanceEquipment(state.player, weapon.uid, { transactionId: `level-${target}` });
    assert.equal(result.ok, true);
    assert.equal(weapon.enhancementLevel, target);
  }
  assert.equal(getEnhancementCost(weapon), null);
  assert.equal(enhanceEquipment(state.player, weapon.uid).code, "max_level");
  assert.ok(calculateItemStats(weapon).attack > 2);
});

test("forja não cobra quando faltam ouro ou materiais", () => {
  const withoutGold = createInitialState();
  const weapon = withoutGold.player.inventory.find(entry => entry.definitionId === "espada_enferrujada");
  withoutGold.player.coins = 0;
  addInventoryItem(withoutGold.player, "fragmento_ferro", 10);
  const goldResult = enhanceEquipment(withoutGold.player, weapon.uid, { transactionId: "no-gold" });
  assert.equal(goldResult.code, "insufficient_gold");
  assert.equal(weapon.enhancementLevel, 0);
  assert.equal(inventoryCount(withoutGold.player, "fragmento_ferro"), 10);

  const withoutMaterial = createInitialState();
  const otherWeapon = withoutMaterial.player.inventory.find(entry => entry.definitionId === "espada_enferrujada");
  withoutMaterial.player.coins = 999;
  const materialResult = enhanceEquipment(withoutMaterial.player, otherWeapon.uid, { transactionId: "no-material" });
  assert.equal(materialResult.code, "insufficient_materials");
  assert.equal(withoutMaterial.player.coins, 999);
  assert.equal(otherWeapon.enhancementLevel, 0);
});

test("venda credita uma vez e recusa equipamento atualmente equipado", () => {
  const state = createInitialState();
  const equipped = state.player.inventory.find(entry => entry.definitionId === "espada_enferrujada");
  const blocked = sellEquipment(state.player, equipped.uid, { transactionId: "sell-equipped" });
  assert.equal(blocked.code, "equipped_item");
  addInventoryItem(state.player, "espada_curta");
  const spare = state.player.inventory.find(entry => entry.definitionId === "espada_curta");
  const expected = calculateSalePrice(spare);
  const coinsBefore = state.player.coins;
  const sold = sellEquipment(state.player, spare.uid, { transactionId: "sell-spare" });
  assert.equal(sold.ok, true);
  assert.equal(state.player.coins, coinsBefore + expected);
  assert.equal(state.player.inventory.some(entry => entry.uid === spare.uid), false);
  assert.equal(sellEquipment(state.player, spare.uid, { transactionId: "sell-spare" }).code, "duplicate_transaction");
});

test("reciclagem de raridade alta devolve minério sem duplicar a transação", () => {
  const state = createInitialState();
  state.player.level = 10;
  assert.equal(addInventoryItem(state.player, "espada_cinzas"), true);
  const item = state.player.inventory.find(entry => entry.definitionId === "espada_cinzas");
  const expected = getSaleReturn(item);
  assert.ok(Object.keys(expected.materials).length > 0);
  const beforeCoins = state.player.coins;
  const result = sellEquipment(state.player, item.uid, { transactionId: "salvage-rare" });
  assert.equal(result.ok, true);
  assert.equal(state.player.coins, beforeCoins + expected.gold);
  for (const [definitionId, quantity] of Object.entries(expected.materials)) {
    assert.equal(inventoryCount(state.player, definitionId), quantity);
  }
  assert.equal(sellEquipment(state.player, item.uid, { transactionId: "salvage-rare" }).code, "duplicate_transaction");
});

test("reciclagem não remove item lendário quando faltam slots para os materiais", () => {
  const state = createInitialState();
  assert.equal(addInventoryItem(state.player, "coroa_rei_goblin"), true);
  const item = state.player.inventory.find(entry => entry.definitionId === "coroa_rei_goblin");
  state.player.bag.capacity = state.player.inventory.length;
  const coinsBefore = state.player.coins;
  const result = sellEquipment(state.player, item.uid, { transactionId: "salvage-full" });
  assert.equal(result.code, "inventory_full");
  assert.equal(state.player.coins, coinsBefore);
  assert.ok(state.player.inventory.some(entry => entry.uid === item.uid));
  assert.equal(inventoryCount(state.player, "fragmento_aco"), 0);
  assert.equal(inventoryCount(state.player, "cristal_raro"), 0);
});

test("arqueiro e arremessador usam projéteis distintos e velocidade de reação justa", () => {
  const archer = createEncounterSpec(12, GAME_CONFIG.firstCave, "ranged");
  const thrower = createEncounterSpec(12, GAME_CONFIG.firstCave, "thrower");
  assert.equal(archer.archetype, "archer");
  assert.equal(archer.ai.pattern, "arrow");
  assert.equal(archer.ai.projectileSpeed, 315);
  assert.equal(thrower.archetype, "thrower");
  assert.equal(thrower.ai.pattern, "rock");
  assert.equal(thrower.ai.projectileSpeed, 285);
  assert.ok(thrower.ai.telegraph >= .6);
});

test("ondas respeitam o limite configurado de atacantes à distância", () => {
  const random = () => .99;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const plan = createWavePlan(12, GAME_CONFIG.firstCave, random);
    const ranged = plan.filter(roleId => ["archer", "thrower"].includes(GAME_CONFIG.firstCave.farm.roles[roleId]?.archetype));
    assert.ok(ranged.length <= getFloorFarmConfig(12).maxRanged);
  }
});

test("compras e reforços repetidos com a mesma transação não duplicam pagamentos", () => {
  const state = createInitialState();
  fundForge(state.player);
  const weapon = state.player.inventory.find(entry => entry.definitionId === "espada_enferrujada");
  const beforeForge = state.player.coins;
  const first = enhanceEquipment(state.player, weapon.uid, { transactionId: "rapid-forge" });
  const repeat = enhanceEquipment(state.player, weapon.uid, { transactionId: "rapid-forge" });
  assert.equal(first.ok, true);
  assert.equal(repeat.code, "duplicate_transaction");
  assert.equal(weapon.enhancementLevel, 1);
  assert.equal(state.player.coins, beforeForge - first.spent.gold);

  const beforeBuy = state.player.coins;
  const bought = purchaseEquipment(state.player, "capacete_ferro", { transactionId: "rapid-buy" });
  const repeatedBuy = purchaseEquipment(state.player, "capacete_ferro", { transactionId: "rapid-buy" });
  assert.equal(bought.ok, true);
  assert.equal(repeatedBuy.code, "duplicate_transaction");
  assert.equal(state.player.coins, beforeBuy - bought.price);
  assert.equal(state.player.inventory.filter(entry => entry.definitionId === "capacete_ferro").length, 1);
});

test("níveis diferentes de reforço permanecem por instância após salvar", () => {
  const storage = new MemoryStorage();
  const state = createInitialState();
  fundForge(state.player);
  addInventoryItem(state.player, "espada_curta", 2);
  const [first, second] = state.player.inventory.filter(entry => entry.definitionId === "espada_curta");
  enhanceEquipment(state.player, first.uid, { transactionId: "persist-one" });
  enhanceEquipment(state.player, first.uid, { transactionId: "persist-two" });
  enhanceEquipment(state.player, second.uid, { transactionId: "persist-three" });
  assert.equal(saveGame(state, { storage, logger: quietLogger }), true);
  const restored = loadGame({ storage, logger: quietLogger });
  assert.equal(restored.player.inventory.find(entry => entry.uid === first.uid).enhancementLevel, 2);
  assert.equal(restored.player.inventory.find(entry => entry.uid === second.uid).enhancementLevel, 1);
});

test("habilidades respeitam nível, pré-requisitos, pontos e melhorias", () => {
  const { player } = createInitialState();
  assert.equal(getSkillLevel(player, "golpe_poderoso"), 0);
  assert.equal(canUpgradeSkill(player, "corte_giratorio").code, "player_level");
  assert.equal(canUpgradeSkill(player, "golpe_poderoso").code, "player_level");
  player.level = 3;
  player.weaponMastery.sword.level = 2;
  player.skillProgression.points = 5;
  assert.equal(upgradeSkill(player, "golpe_poderoso").ok, true);
  assert.equal(player.skillProgression.points, 4);
  assert.equal(getSkillLevel(player, "golpe_poderoso"), 1);
  player.level = 5;
  assert.equal(upgradeSkill(player, "corte_giratorio").ok, true);
  assert.equal(getSkillLevel(player, "corte_giratorio"), 1);
  assert.equal(canUpgradeSkill(player, "investida").code, "player_level");
});

test("ativação consome vigor uma vez, aplica cooldown e só cancela antecipação", () => {
  const { player } = createInitialState();
  player.level = 3;
  player.weaponMastery.sword.level = 2;
  player.skillProgression.points = 1;
  upgradeSkill(player, "golpe_poderoso");
  const runtime = createSkillRuntime();
  const before = player.resources.stamina;
  const activation = beginSkill(player, "golpe_poderoso", runtime, { x: 1, y: 0 });
  assert.equal(activation.ok, true);
  assert.equal(player.resources.stamina, before - activation.cost);
  assert.equal(beginSkill(player, "golpe_poderoso", runtime, { x: 1, y: 0 }).code, "busy");
  assert.equal(player.resources.stamina, before - activation.cost);
  assert.equal(cancelSkill(runtime), true);
  assert.equal(beginSkill(player, "golpe_poderoso", runtime, { x: 1, y: 0 }).code, "cooldown");
  tickSkillRuntime(player, runtime, activation.cooldown);
  assert.equal(runtime.cooldowns.golpe_poderoso, 0);
  assert.ok(player.resources.stamina > before - activation.cost);

  beginSkill(player, "golpe_poderoso", runtime, { x: 1, y: 0 });
  runtime.active.phase = "active";
  assert.equal(cancelSkill(runtime), false);
  runtime.active = null;
  runtime.cooldowns.golpe_poderoso = 0;
  player.equipment.weapon = null;
  assert.equal(beginSkill(player, "golpe_poderoso", runtime, { x: 1, y: 0 }).code, "weapon");
});

test("fases e colisões das três habilidades seguem seus parâmetros", () => {
  const power = SKILLS.golpe_poderoso;
  assert.equal(skillPhaseAt(power, .05), "anticipation");
  assert.equal(skillPhaseAt(power, power.phases.anticipation + .02), "active");
  assert.equal(skillPhaseAt(power, power.phases.anticipation + power.phases.active + .02), "recovery");
  const origin = { x: 0, y: 0 };
  assert.equal(skillTargetHit({ id: "golpe_poderoso", direction: { x: 1, y: 0 } }, power, origin, { x: 80, y: 0 }), true);
  assert.equal(skillTargetHit({ id: "golpe_poderoso", direction: { x: 1, y: 0 } }, power, origin, { x: -20, y: 0 }), false);
  const spin = SKILLS.corte_giratorio;
  assert.equal(skillTargetHit({ id: "corte_giratorio", direction: { x: 1, y: 0 } }, spin, origin, { x: 0, y: 87 }), true);
  const charge = SKILLS.investida;
  assert.equal(skillTargetHit({ id: "investida", direction: { x: 1, y: 0 } }, charge, origin, { x: 39, y: 0 }), false);
});

test("maestria exige dano real, rejeita evento duplicado e limita ganho por alvo", () => {
  const { player } = createInitialState();
  const tracker = createMasteryTracker();
  const base = { encounterId: "c1", targetId: "g1", targetMaxHp: 100 };
  assert.equal(awardMasteryForHit(player, tracker, { ...base, eventId: "miss", damage: 0 }).gained, 0);
  const first = awardMasteryForHit(player, tracker, { ...base, eventId: "hit-1", damage: 20 });
  assert.ok(first.gained > 0);
  assert.equal(awardMasteryForHit(player, tracker, { ...base, eventId: "hit-1", damage: 20 }).gained, 0);
  for (let index = 2; index < 20; index += 1) awardMasteryForHit(player, tracker, { ...base, eventId: `hit-${index}`, damage: 20 });
  assert.equal(tracker.targets.get("c1:g1:sword"), GAME_CONFIG.skills.masteryTargetCap);
});

test("habilidades, vigor e maestria persistem no save", () => {
  const storage = new MemoryStorage();
  const state = createInitialState();
  state.player.level = 3;
  state.player.weaponMastery.sword.level = 2;
  state.player.skillProgression.points = 1;
  upgradeSkill(state.player, "golpe_poderoso");
  state.player.resources.stamina = 43;
  state.player.weaponMastery.sword.exp = 17;
  assert.equal(saveGame(state, { storage, logger: quietLogger }), true);
  const restored = loadGame({ storage, logger: quietLogger });
  assert.equal(getSkillLevel(restored.player, "golpe_poderoso"), 1);
  assert.equal(restored.player.resources.stamina, 43);
  assert.equal(restored.player.weaponMastery.sword.exp, 17);
});

test("passivas alteram atributos uma única vez e sobrevivem à normalização", () => {
  const state = createInitialState();
  state.player.level = 2;
  state.player.skillProgression.points = 2;
  const before = calculateStats(state.player);
  assert.equal(upgradeSkill(state.player, "resistencia").ok, true);
  const after = calculateStats(state.player);
  assert.equal(after.armor, before.armor + 2);
  assert.equal(after.maxHp, before.maxHp + 6);
  const normalized = normalizeGameState(state);
  assert.deepEqual(calculateStats(normalized.player), after);
  assert.equal(validateGameState(normalized).valid, true);
});

test("simulação de progressão é determinística para a mesma semente", () => {
  const first = simulateProgression({ seed: "knightfall-regression", profile: "standard" });
  const repeat = simulateProgression({ seed: "knightfall-regression", profile: "standard" });
  assert.deepEqual(repeat, first);
  assert.notDeepEqual(
    simulateProgression({ seed: "outra-semente", profile: "standard" }).equipmentFound,
    first.equipmentFound
  );
  const randomA = createSeededRandom(42);
  const randomB = createSeededRandom(42);
  assert.deepEqual([randomA(), randomA(), randomA()], [randomB(), randomB(), randomB()]);
});

test("coorte padrão respeita a cadência hipotética dos marcos principais", () => {
  const result = simulateCohort({ seed: 41021, runs: 80, profile: "standard" });
  assert.ok(result.completionRate >= .25 && result.completionRate <= .9, `conclusão: ${result.completionRate}`);
  assert.ok(result.medianFightsToFirstLevel >= 15 && result.medianFightsToFirstLevel <= 30);
  assert.ok(result.meanImprovements > result.meanForgeEnhancements);
  for (const [milestone, [minimum, maximum]] of Object.entries(PROGRESSION_HYPOTHESES)) {
    const median = result.milestoneMedianSeconds[milestone];
    assert.ok(median >= minimum && median <= maximum, `${milestone}: ${median}s fora de ${minimum}-${maximum}s`);
  }
  assert.ok(result.meanKillSeconds < 16);
  assert.ok(result.boss.meanDangerRatio > .5 && result.boss.meanDangerRatio < .9);
});

test("economia inicial exige jogo ativo e custos da forja crescem sem recuar", () => {
  const startingCoins = GAME_CONFIG.player.startingCoins;
  assert.ok(GAME_CONFIG.economy.attackUpgrade.basePrice > startingCoins);
  assert.ok(GAME_CONFIG.economy.armorUpgrade.basePrice > startingCoins);
  for (const definitionId of GAME_CONFIG.economy.merchantEquipment) {
    assert.ok(ITEMS[definitionId].buyPrice > startingCoins, definitionId);
  }
  const forgeCosts = Object.values(GAME_CONFIG.forge.costs).map(cost => cost.gold);
  assert.ok(forgeCosts.every((cost, index) => index === 0 || cost > forgeCosts[index - 1]));
  assert.equal(GAME_CONFIG.forge.costs[1].materials.fragmento_ferro, 2);
  for (let level = 2; level <= 10; level += 1) {
    assert.ok(playerExpRequired(level) / playerExpRequired(level - 1) <= 1.45);
  }
  const cohort = simulateCohort({ seed: 41021, runs: 80, profile: "standard" });
  assert.ok(cohort.meanGoldPerMinute < 40, `ouro/min: ${cohort.meanGoldPerMinute}`);
});
