import test from "node:test";
import assert from "node:assert/strict";

import { EQUIPMENT_SLOTS, GAME_CONFIG, ITEMS, SKILLS } from "../js/data.js";
import {
  abandonCaveExpedition, advanceCaveFloor, beginCaveExpedition, createCaveProgress,
  createEncounterSpec, createRegionProgress, getCaveTier, getRegionConfig,
  grantEncounterRewards, regionUnlockStatus
} from "../js/dungeon.js";
import { rollLoot } from "../js/loot.js";
import {
  calculateSalePrice, enhanceEquipment, getEnhancementCost, purchaseEquipment, sellEquipment
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
import { createInitialState, normalizeGameState, validateGameState } from "../js/state.js";
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
  assert.equal(state.world.currentArea, "cavernas_sussurro");
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

test("save atual faz round-trip, valida e sempre grava retorno seguro à vila", () => {
  const storage = new MemoryStorage();
  const original = createInitialState({ name: "Aldric Teste" });
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
  assert.equal(restored.world.scene, "village");
  assert.deepEqual(
    { x: restored.player.x, y: restored.player.y },
    { x: GAME_CONFIG.player.startPosition.x, y: GAME_CONFIG.player.startPosition.y }
  );
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
  assert.equal(state.systems.trainingSession, null);
  assert.equal(state.systems.autoFarmSession, null);
  assert.equal(state.systems.autoFarmSettings.potionThreshold, .9);
  assert.equal(state.systems.autoFarmSettings.autoPotion, true);

  const needed = playerExpRequired(1);
  const skillPointsBefore = state.player.skillProgression.points;
  const result = grantPlayerExperience(state.player, needed);
  assert.equal(result.levels, 1);
  assert.equal(state.player.level, 2);
  assert.equal(state.player.baseStats.maxHp, 112);
  assert.equal(state.player.baseStats.attack, 14);
  assert.equal(state.player.skillProgression.points, skillPointsBefore + GAME_CONFIG.progression.skillPointsPerLevel);
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

test("as faixas dos 20 andares selecionam arquétipos por configuração", () => {
  assert.equal(getCaveTier(1).archetype, "common");
  assert.equal(getCaveTier(5).archetype, "common");
  assert.equal(getCaveTier(6).archetype, "warrior");
  assert.equal(getCaveTier(10).archetype, "warrior");
  assert.equal(getCaveTier(11).archetype, "archer");
  assert.equal(getCaveTier(15).archetype, "archer");
  assert.equal(getCaveTier(16).archetype, "elite");
  assert.equal(getCaveTier(19).archetype, "elite");
  assert.equal(createEncounterSpec(20).boss, true);
});

test("andar atual e maior andar desbloqueado evoluem separadamente", () => {
  const progress = createCaveProgress();
  assert.equal(beginCaveExpedition(progress), 1);
  advanceCaveFloor(progress, 1);
  assert.equal(progress.currentExpeditionFloor, 2);
  assert.equal(progress.highestUnlockedFloor, 2);
  progress.currentExpeditionFloor = null;
  assert.equal(beginCaveExpedition(progress), 2);
  progress.currentExpeditionFloor = 1;
  advanceCaveFloor(progress, 1);
  assert.equal(progress.highestUnlockedFloor, 2);
  abandonCaveExpedition(progress);
  assert.equal(progress.currentExpeditionFloor, null);
  assert.equal(progress.highestUnlockedFloor, 2);
});

test("a recompensa única do Rei Goblin só é concedida uma vez", () => {
  const progress = createCaveProgress({ highestUnlockedFloor: 20, currentExpeditionFloor: 20 });
  const boss = createEncounterSpec(20);
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
  state.world.bossesDefeated.rei_goblin = 1;
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
  const boss = createEncounterSpec(10, grove);
  assert.equal(boss.boss, true);
  assert.equal(boss.name, "Cervo-Rei Putrificado");
  assert.deepEqual(boss.ai.patterns, ["heavy", "charge", "area"]);
});

test("progresso e recompensa única permanecem independentes por região", () => {
  const state = createInitialState();
  const cave = state.world.regionProgress.caverna_sombria;
  const grove = state.world.regionProgress.bosque_cinzas;
  advanceCaveFloor(cave, 1, GAME_CONFIG.firstCave);
  assert.equal(cave.highestUnlockedFloor, 2);
  assert.equal(grove.highestUnlockedFloor, 1);

  grove.highestUnlockedFloor = 10;
  grove.currentExpeditionFloor = 10;
  const boss = createEncounterSpec(10, GAME_CONFIG.ashenGrove);
  const first = grantEncounterRewards(grove, boss, () => 0);
  const repeated = grantEncounterRewards(grove, boss, () => 0);
  assert.equal(first.firstVictory.items[0].definitionId, "coroa_cervo");
  assert.equal(repeated.firstVictory, null);
  assert.equal(cave.uniqueRewardsClaimed.rottenStagFirstVictory, undefined);
});

test("save preserva região selecionada e progressos regionais sem misturá-los", () => {
  const state = createInitialState();
  state.world.currentRegionId = "bosque_cinzas";
  state.world.bossesDefeated.rei_goblin = 1;
  state.world.regionProgress.caverna_sombria.highestUnlockedFloor = 20;
  state.world.regionProgress.bosque_cinzas.highestUnlockedFloor = 4;
  const restored = normalizeGameState(structuredClone(state));
  assert.equal(restored.world.currentRegionId, "bosque_cinzas");
  assert.equal(restored.world.regionProgress.caverna_sombria.highestUnlockedFloor, 20);
  assert.equal(restored.world.regionProgress.bosque_cinzas.highestUnlockedFloor, 4);
});

test("progresso da caverna persiste e saves antigos recebem migração segura", () => {
  const storage = new MemoryStorage();
  const state = createInitialState();
  const cave = state.world.regionProgress.caverna_sombria;
  cave.highestUnlockedFloor = 7;
  cave.currentExpeditionFloor = 6;
  cave.floorCompletions = { 1: 1, 5: 2 };
  assert.equal(saveGame(state, { storage, logger: quietLogger }), true);
  const restored = loadGame({ storage, logger: quietLogger });
  assert.equal(restored.world.regionProgress.caverna_sombria.highestUnlockedFloor, 7);
  assert.equal(restored.world.regionProgress.caverna_sombria.currentExpeditionFloor, 6);
  assert.equal(restored.world.regionProgress.caverna_sombria.floorCompletions[5], 2);

  const versionThree = createInitialState();
  versionThree.schemaVersion = 3;
  versionThree.player.progression.kills = 8;
  versionThree.world.caveProgress = { highestUnlockedFloor: 9, currentExpeditionFloor: null };
  delete versionThree.world.regionProgress;
  const migrated = decodeSave(JSON.stringify({ game: GAME_CONFIG.save.gameId, version: 3, state: versionThree }), SAVE_KEY);
  assert.equal(migrated.world.regionProgress.caverna_sombria.highestUnlockedFloor, 9);
  assert.equal(migrated.world.regionProgress.caverna_sombria.currentExpeditionFloor, null);
  assert.equal(migrated.world.regionProgress.bosque_cinzas.highestUnlockedFloor, 1);
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
  assert.equal(upgradeSkill(player, "golpe_poderoso").ok, true);
  assert.equal(player.skillProgression.points, 0);
  assert.equal(getSkillLevel(player, "golpe_poderoso"), 1);
  player.level = 2;
  player.skillProgression.points = 2;
  assert.equal(upgradeSkill(player, "corte_giratorio").ok, true);
  assert.equal(getSkillLevel(player, "corte_giratorio"), 1);
  assert.equal(canUpgradeSkill(player, "investida").code, "player_level");
});

test("ativação consome vigor uma vez, aplica cooldown e só cancela antecipação", () => {
  const { player } = createInitialState();
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
  assert.equal(result.completionRate, 1);
  assert.ok(result.medianFightsToFirstLevel >= 2 && result.medianFightsToFirstLevel <= 5);
  assert.ok(result.meanImprovements > result.meanForgeEnhancements);
  for (const [milestone, [minimum, maximum]] of Object.entries(PROGRESSION_HYPOTHESES)) {
    const median = result.milestoneMedianSeconds[milestone];
    assert.ok(median >= minimum && median <= maximum, `${milestone}: ${median}s fora de ${minimum}-${maximum}s`);
  }
  assert.ok(result.meanKillSeconds < 16);
  assert.ok(result.boss.meanDangerRatio > .2 && result.boss.meanDangerRatio < .65);
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
});
