import { EQUIPMENT_SLOTS, GAME_CONFIG, ITEMS, RARITIES, SKILLS } from "./data.js";
import {
  abandonCaveExpedition, beginCaveExpedition, createEncounterSpec, ENEMY_STATES,
  getFloorUnlockTarget, getRegionConfig, grantEncounterRewards, recordFloorKill,
  regionUnlockStatus, selectCaveFloor
} from "./dungeon.js";
import {
  addOwnedProjectile, claimEnemyReward, createFarmRuntime, updateFarmSpawner
} from "./farm.js";
import { gameAudio } from "./music.js";
import {
  addInventoryItem, calculateItemStats, calculateStatBreakdown, calculateStats, canEquipItem,
  equipItem, getEquippedEntry, getInventoryEntry, inventoryCapacity, inventoryCount,
  inventoryUsed, removeInventoryItem, unequipSlot
} from "./player.js";
import { grantPlayerExperience, masteryExpRequired, playerExpRequired } from "./progression.js";
import {
  awardMasteryForHit, beginSkill, canUpgradeSkill, cancelSkill, createMasteryTracker,
  createSkillRuntime, getSkillLevel, outgoingDamageMultiplier, skillCooldown, skillDuration,
  skillPhaseAt, skillResourceCost, skillTargetHit, skillValue, tickSkillRuntime, upgradeSkill
} from "./skills.js";
import {
  calculateSalePrice, canEnhanceEquipment, enhanceEquipment, getEnhancementPreview,
  purchaseEquipment, sellEquipment
} from "./forge.js";
import { hasSave as hasStoredSave, loadGame as restoreGame, saveGame as persistGame } from "./save.js";
import { createInitialState } from "./state.js";

const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const W = canvas.width;
const H = canvas.height;

const ui = Object.fromEntries([
  "start-screen", "continue-button", "new-game-button", "player-name", "side-player-name",
  "level-value", "hp-text", "hp-bar", "xp-bar", "attack-stat", "armor-stat", "kills-stat",
  "potion-count", "coin-count", "potion-button", "cave-progress", "objective-title",
  "objective-detail", "location-badge", "interaction-prompt", "interaction-text", "enemy-hud",
  "enemy-name", "enemy-phase", "enemy-hp-text", "enemy-hp-bar", "toast", "merchant-dialog", "merchant-coins",
  "damage-price", "armor-price", "death-dialog", "return-button", "sound-button",
  "fullscreen-button", "viewport", "save-status", "inventory-button", "inventory-summary",
  "inventory-dialog", "inventory-capacity", "inventory-stats", "equipment-slots",
  "inventory-grid", "inventory-empty", "item-detail", "item-tooltip", "cave-floor-badge",
  "cave-floor-value", "encounter-dialog", "encounter-kicker", "encounter-title",
  "encounter-summary", "encounter-rewards", "advance-floor-button", "leave-cave-button",
  "merchant-equipment-grid", "merchant-forge-button", "forge-dialog", "forge-close-button",
  "forge-coins", "forge-materials", "forge-equipment-list", "forge-empty", "forge-preview",
  "forge-rarity", "forge-name", "forge-level", "forge-stats", "forge-cost", "forge-message",
  "forge-button", "forge-sell-button", "skill-hotbar", "stamina-bar", "stamina-text",
  "skills-button", "skills-dialog", "skills-close-button", "skill-points", "active-skills-list",
  "passive-skills-list", "mastery-emblem", "sword-mastery-level", "sword-mastery-bar", "sword-mastery-text",
  "region-button", "region-dialog", "region-close-button", "region-grid", "journey-region-name",
  "grove-journey-row", "grove-journey-status"
].map(id => [id, document.querySelector(`#${id}`)]));

let state = createInitialState();
let playing = false;
let encounter = createRuntimeEncounter();
let farmRuntime = null;
let pathfindBudget = 0;
let lastTime = performance.now();
let elapsed = 0;
const PLAYER_ATTACK_DURATION = GAME_CONFIG.combat.playerAttackDuration;
const ENEMY_ATTACK_DURATION = GAME_CONFIG.combat.enemyAttackDuration;
let attackTimer = 0;
let attackHitPending = false;
let basicAttackEventId = null;
let dodgeTimer = 0;
let dodgeCooldownTimer = 0;
let dodgeDirX = 0;
let dodgeDirY = 1;
let invulnerableTimer = 0;
let moving = false;
let transitionFlash = 0;
let toastTimer = 0;
let saveTimer = 0;
let selectedInventoryUid = null;
let selectedForgeUid = null;
let forgeBusy = false;
let merchantBusy = false;
let forgeEffectTimer = 0;
let skillRuntime = createSkillRuntime();
let masteryTracker = createMasteryTracker();
const forgeIcon = document.createElement("canvas");
forgeIcon.width = 48;
forgeIcon.height = 48;
const keys = new Set();
const particles = [];
const floaters = [];
const projectiles = [];

ctx.imageSmoothingEnabled = false;

const TILE = 32;
const merchant = { x: 196, y: 286 };
const forgeStation = { x: 590, y: 286 };
const caveEntrance = { x: 790, y: 185 };
const villageTrees = [
  [48, 142, 1], [112, 142, 1], [176, 142, 1], [304, 142, 1], [368, 142, 1],
  [496, 142, 1], [560, 142, 1], [624, 142, 1], [912, 142, 1], [48, 474, 1],
  [112, 474, 1], [176, 506, 1], [816, 506, 1], [880, 474, 1], [944, 442, 1]
];
const villageRocks = [[330, 466, 14], [630, 435, 12], [716, 330, 10], [470, 196, 9], [858, 320, 14]];
const caveRocks = [[142, 158, 22], [252, 130, 16], [705, 142, 20], [820, 218, 24], [128, 390, 20], [778, 414, 18], [330, 315, 14], [638, 302, 16], [478, 214, 13]];
const groveObstacles = [[126, 170, 27], [260, 132, 22], [718, 155, 26], [842, 245, 25], [112, 403, 24], [795, 420, 23], [352, 330, 19], [645, 322, 21], [492, 205, 18]];

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function randomBetween(min, max) { return min + Math.random() * (max - min); }

function createRuntimeEncounter() {
  return { id: `encounter_${Date.now()}_${Math.random()}`, status: "idle", spec: null, enemies: [], rewardResults: [] };
}

function primaryEnemy() {
  const living = encounter.enemies.filter(actor => actor.state !== ENEMY_STATES.DYING);
  return living.find(actor => actor.spec.boss)
    || living.sort((a, b) => distance(a, state.player) - distance(b, state.player))[0]
    || encounter.enemies[0] || null;
}

function currentRegionConfig() { return getRegionConfig(state.world.currentRegionId); }
function currentRegionProgress() { return state.world.regionProgress[state.world.currentRegionId]; }
function currentRegionDefinition() { return GAME_CONFIG.regions[state.world.currentRegionId]; }

function clearEncounterRuntime(status = "idle") {
  encounter = createRuntimeEncounter();
  encounter.status = status;
  farmRuntime = null;
  projectiles.length = 0;
  masteryTracker = createMasteryTracker();
  skillRuntime.active = null;
}

function hasSave() {
  return hasStoredSave();
}

function saveGame(showStatus = false) {
  if (!playing) return;
  const saved = persistGame(state);
  if (!saved) {
    showToast("Não foi possível salvar o progresso.", true);
    return;
  }
  if (showStatus) {
    ui["save-status"].classList.add("saving");
    ui["save-status"].lastChild.textContent = " Progresso salvo";
    window.setTimeout(() => ui["save-status"].classList.remove("saving"), 500);
  }
}

function loadGame() {
  const restored = restoreGame();
  if (!restored) return false;
  state = restored;
  state.world.scene = "village";
  state.player.x = clamp(state.player.x, 80, 880);
  state.player.y = clamp(state.player.y, 150, 475);
  return true;
}

function startGame(useSave) {
  const resumed = Boolean(useSave && loadGame());
  if (!resumed) state = createInitialState();
  playing = true;
  clearEncounterRuntime();
  attackTimer = 0;
  attackHitPending = false;
  basicAttackEventId = null;
  skillRuntime = createSkillRuntime();
  masteryTracker = createMasteryTracker();
  dodgeTimer = 0;
  dodgeCooldownTimer = 0;
  invulnerableTimer = 0;
  if (ui["start-screen"].contains(document.activeElement)) document.activeElement.blur();
  ui["start-screen"].inert = true;
  ui["start-screen"].classList.add("hidden");
  ui["start-screen"].setAttribute("aria-hidden", "true");
  ui["continue-button"].hidden = false;
  updateUI();
  showToast(resumed ? "Jornada retomada." : "A caverna aguarda ao nordeste.");
  playTone(174, .07, .12, "triangle");
}

function updateUI() {
  const p = state.player;
  const enemy = primaryEnemy();
  const regionConfig = currentRegionConfig();
  const regionDefinition = currentRegionDefinition();
  const cave = currentRegionProgress();
  const firstCave = state.world.regionProgress.caverna_sombria;
  const stats = calculateStats(p);
  const xpToNext = playerExpRequired(p.level);
  const kills = p.progression.kills;
  ui["player-name"].textContent = p.name;
  ui["side-player-name"].textContent = p.name;
  ui["level-value"].textContent = p.level;
  ui["hp-text"].textContent = `${Math.ceil(p.hp)} / ${stats.maxHp}`;
  ui["hp-bar"].style.width = `${clamp(p.hp / stats.maxHp * 100, 0, 100)}%`;
  ui["xp-bar"].style.width = `${clamp(p.xp / xpToNext * 100, 0, 100)}%`;
  ui["attack-stat"].textContent = stats.attack;
  ui["armor-stat"].textContent = stats.armor;
  ui["kills-stat"].textContent = kills;
  ui["potion-count"].textContent = `× ${inventoryCount(p, "pocao_menor")}`;
  ui["coin-count"].textContent = p.coins;
  ui["inventory-summary"].textContent = `${inventoryUsed(p)} / ${inventoryCapacity(p)}`;
  ui["journey-region-name"].textContent = regionDefinition.name;
  ui["cave-progress"].textContent = `${regionDefinition.name}: estágio ${cave.highestUnlockedFloor} de ${regionConfig.totalFloors}`;
  const groveUnlocked = regionUnlockStatus(state.world, "bosque_cinzas").unlocked;
  ui["grove-journey-row"].classList.toggle("locked", !groveUnlocked);
  ui["grove-journey-status"].textContent = groveUnlocked
    ? `Estágio ${state.world.regionProgress.bosque_cinzas.highestUnlockedFloor} de ${GAME_CONFIG.ashenGrove.totalFloors}`
    : "Derrote o Rei Goblin";
  ui["merchant-coins"].textContent = p.coins;
  ui["forge-coins"].textContent = p.coins;
  ui["damage-price"].textContent = damagePrice();
  ui["armor-price"].textContent = armorPrice();
  updateSkillHotbar();
  ui["sound-button"].setAttribute("aria-pressed", String(state.settings.audioEnabled));
  ui["sound-button"].setAttribute("aria-label", state.settings.audioEnabled ? "Desativar sons" : "Ativar sons");
  ui["sound-button"].textContent = state.settings.audioEnabled ? "♪" : "♩";
  ui["location-badge"].innerHTML = state.world.scene === "village"
    ? "<span>♦</span> Clareira do Corvo"
    : `<span>♦</span> ${regionDefinition.name}`;
  const displayedFloor = state.world.scene === "cave" && encounter.spec
    ? encounter.spec.floor
    : cave.selectedFloor || cave.highestUnlockedFloor;
  const floorKills = cave.floorKills[displayedFloor] || 0;
  const floorTarget = getFloorUnlockTarget(displayedFloor, regionConfig);
  ui["cave-floor-badge"].hidden = state.world.scene !== "cave";
  ui["cave-floor-value"].textContent = displayedFloor === regionConfig.totalFloors
    ? `${displayedFloor} / ${regionConfig.totalFloors} · CHEFE ${cave.bossVictories}`
    : `${displayedFloor} / ${regionConfig.totalFloors} · ${Math.min(floorKills, floorTarget)} / ${floorTarget}`;

  if (state.world.scene === "cave") {
    ui["objective-title"].textContent = enemy
      ? `${encounter.enemies.filter(actor => actor.state !== ENEMY_STATES.DYING).length} ameaça(s) ativa(s)`
      : encounter.status === "complete" ? "Encontro concluído" : "A próxima onda se aproxima";
    ui["objective-detail"].textContent = displayedFloor === regionConfig.totalFloors
      ? `${regionDefinition.name} · chefe repetível · saída ao sul`
      : `${floorKills} de ${floorTarget} abates · você escolhe quando avançar`;
  } else if (firstCave.bossVictories > 0) {
    ui["objective-title"].textContent = "Novos caminhos estão abertos";
    ui["objective-detail"].textContent = "Use o mapa próximo à entrada para escolher uma região";
  } else if (firstCave.highestUnlockedFloor > 1) {
    ui["objective-title"].textContent = "Retorne à Caverna Sombria";
    ui["objective-detail"].textContent = `O andar ${firstCave.highestUnlockedFloor} está desbloqueado`;
  } else {
    ui["objective-title"].textContent = "Entre na Caverna Sombria";
    ui["objective-detail"].textContent = "Siga a trilha ao nordeste da vila";
  }

  if (enemy) {
    ui["enemy-hud"].hidden = false;
    ui["enemy-hud"].classList.toggle("boss-hud", enemy.spec.boss);
    ui["enemy-name"].textContent = `${enemy.name} · Andar ${enemy.spec.floor}`;
    ui["enemy-phase"].textContent = enemy.spec.boss ? `FASE ${enemy.phase}` : enemy.spec.tierLabel.toUpperCase();
    ui["enemy-hp-text"].textContent = `${Math.ceil(enemy.hp)} / ${enemy.maxHp}`;
    ui["enemy-hp-bar"].style.width = `${clamp(enemy.hp / enemy.maxHp * 100, 0, 100)}%`;
  } else {
    ui["enemy-hud"].hidden = true;
    ui["enemy-hud"].classList.remove("boss-hud");
  }

  document.querySelectorAll("[data-buy]").forEach(button => {
    const prices = { damage: damagePrice(), armor: armorPrice(), potion: GAME_CONFIG.economy.potionPrice, heal: GAME_CONFIG.economy.restPrice };
    const key = button.dataset.buy;
    const potionHasNoRoom = key === "potion" && !p.inventory.some(entry => entry.definitionId === "pocao_menor") && inventoryUsed(p) >= inventoryCapacity(p);
    const upgrade = key === "damage" ? GAME_CONFIG.economy.attackUpgrade : key === "armor" ? GAME_CONFIG.economy.armorUpgrade : null;
    const upgradeCount = key === "damage" ? p.progression.upgrades.attack : key === "armor" ? p.progression.upgrades.armor : 0;
    const reachedPermanentCap = upgrade && upgradeCount >= upgrade.maxPurchases;
    button.disabled = p.coins < prices[key] || potionHasNoRoom || reachedPermanentCap || (key === "heal" && p.hp >= stats.maxHp);
    if (reachedPermanentCap) button.title = "Limite permanente alcançado";
  });
}

function updateSkillHotbar() {
  const resources = state.player.resources;
  ui["stamina-bar"].style.width = `${clamp(resources.stamina / resources.maxStamina * 100, 0, 100)}%`;
  ui["stamina-text"].textContent = Math.floor(resources.stamina);
  document.querySelectorAll(".skill-hotbar [data-skill]").forEach(button => {
    const id = button.dataset.skill;
    const level = getSkillLevel(state.player, id);
    const cooldown = skillRuntime.cooldowns[id] || 0;
    button.classList.toggle("locked", !level);
    button.classList.toggle("active", skillRuntime.active?.id === id);
    button.disabled = !playing || !level;
    button.title = level ? `${SKILLS[id].name} · Nv. ${level}` : `${SKILLS[id].name} · Bloqueada`;
    button.querySelector(".skill-cooldown").textContent = cooldown > 0 ? cooldown.toFixed(1) : "";
  });
}

function damagePrice() {
  const config = GAME_CONFIG.economy.attackUpgrade;
  if (state.player.progression.upgrades.attack >= config.maxPurchases) return "MÁX";
  return config.basePrice + state.player.progression.upgrades.attack * config.priceStep;
}
function armorPrice() {
  const config = GAME_CONFIG.economy.armorUpgrade;
  if (state.player.progression.upgrades.armor >= config.maxPurchases) return "MÁX";
  return config.basePrice + state.player.progression.upgrades.armor * config.priceStep;
}

function showToast(message, error = false) {
  ui.toast.textContent = message;
  ui.toast.classList.toggle("error", error);
  ui.toast.classList.add("visible");
  toastTimer = 2.3;
}

function playTone(frequency, volume = .05, duration = .08, type = "square") {
  gameAudio.setEnabled(state.settings.audioEnabled);
  gameAudio.tone(frequency, volume, duration, type);
}

function interact() {
  if (!playing || dialogOpen()) return;
  if (state.world.scene === "village") {
    if (distance(state.player, merchant) < 70) openMerchant();
    else if (distance(state.player, forgeStation) < 78) openForge();
    else if (distance(state.player, caveEntrance) < 82) openRegions();
  } else if (distance(state.player, { x: 480, y: 485 }) < 75) exitCave();
}

function openMerchant() {
  if (dialogOpen()) return;
  updateUI();
  renderMerchantEquipment();
  keys.clear();
  ui["merchant-dialog"].showModal();
  playTone(260, .05, .09, "triangle");
}

function renderMerchantEquipment() {
  const entries = GAME_CONFIG.economy.merchantEquipment.map(definitionId => {
    const item = ITEMS[definitionId];
    const article = document.createElement("article");
    article.className = "merchant-equipment";
    const icon = document.createElement("canvas");
    icon.width = 48; icon.height = 48;
    const copy = document.createElement("div");
    copy.innerHTML = `<strong>${item.name}</strong><small>${RARITIES[item.rarity].label} · ${formatItemStats(item.stats)}</small>`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${item.buyPrice} ●`;
    button.disabled = merchantBusy || state.player.coins < item.buyPrice || inventoryUsed(state.player) >= inventoryCapacity(state.player);
    button.addEventListener("click", () => buyMerchantEquipment(definitionId));
    article.append(icon, copy, button);
    drawItemIcon(icon, item);
    return article;
  });
  ui["merchant-equipment-grid"].replaceChildren(...entries);
}

function buyMerchantEquipment(definitionId) {
  if (merchantBusy) return;
  merchantBusy = true;
  const transactionId = `buy_${Date.now()}_${Math.random()}`;
  const result = purchaseEquipment(state.player, definitionId, { transactionId });
  if (!result.ok) showToast(result.reason, true);
  else {
    showToast(`${ITEMS[definitionId].name} comprado por ${result.price} moedas.`);
    playTone(510, .05, .1, "triangle");
    saveGame(true);
  }
  updateUI();
  renderMerchantEquipment();
  window.setTimeout(() => { merchantBusy = false; if (ui["merchant-dialog"].open) renderMerchantEquipment(); }, 280);
}

function openForge() {
  if (!playing || state.world.scene !== "village") return;
  if (ui["merchant-dialog"].open) ui["merchant-dialog"].close();
  if (dialogOpen()) return;
  keys.clear();
  const equipment = state.player.inventory.filter(entry => ITEMS[entry.definitionId]?.type === "equipment");
  if (!equipment.some(entry => entry.uid === selectedForgeUid)) selectedForgeUid = equipment[0]?.uid || null;
  forgeEffectTimer = 0;
  renderForgeUI();
  ui["forge-dialog"].showModal();
  playTone(145, .05, .12, "square");
}

function closeForge() {
  if (ui["forge-dialog"].open) ui["forge-dialog"].close();
  forgeBusy = false;
  forgeEffectTimer = 0;
}

function renderForgeUI(message = "", success = false) {
  const equipment = state.player.inventory.filter(entry => ITEMS[entry.definitionId]?.type === "equipment");
  const selected = equipment.find(entry => entry.uid === selectedForgeUid) || null;
  ui["forge-coins"].textContent = state.player.coins;
  renderForgeMaterials();
  ui["forge-empty"].hidden = equipment.length > 0;
  ui["forge-equipment-list"].replaceChildren(...equipment.map(entry => {
    const item = ITEMS[entry.definitionId];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `forge-equipment-entry${entry.uid === selectedForgeUid ? " selected" : ""}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(entry.uid === selectedForgeUid));
    const icon = document.createElement("canvas"); icon.width = 48; icon.height = 48;
    const copy = document.createElement("span");
    copy.innerHTML = `<strong>${item.name}</strong><small>${EQUIPMENT_SLOTS[item.slot].label} · ${RARITIES[item.rarity].label}</small>`;
    const level = document.createElement("b"); level.textContent = `+${entry.enhancementLevel}`;
    button.append(icon, copy, level);
    drawItemIcon(icon, item);
    button.addEventListener("click", () => { selectedForgeUid = entry.uid; forgeEffectTimer = 0; renderForgeUI(); });
    return button;
  }));
  renderForgeSelection(selected, message, success);
}

function renderForgeMaterials() {
  const ids = ["fragmento_ferro", "fragmento_aco", "essencia", "seiva_corrompida", "cinza_viva", "cristal_raro"];
  ui["forge-materials"].replaceChildren(...ids.map(definitionId => {
    const item = ITEMS[definitionId];
    const node = document.createElement("div"); node.className = "forge-material";
    const icon = document.createElement("canvas"); icon.width = 48; icon.height = 48;
    const copy = document.createElement("span"); copy.innerHTML = `<span>${item.name}</span><strong>${inventoryCount(state.player, definitionId)}</strong>`;
    node.append(icon, copy); drawItemIcon(icon, item); return node;
  }));
}

function renderForgeSelection(entry, message, success) {
  ui["forge-message"].textContent = message;
  ui["forge-message"].classList.toggle("success", success);
  if (!entry) {
    ui["forge-rarity"].textContent = "—";
    ui["forge-name"].textContent = "Selecione um equipamento";
    ui["forge-level"].textContent = "Reforço indisponível";
    ui["forge-stats"].replaceChildren();
    ui["forge-cost"].replaceChildren();
    ui["forge-button"].disabled = true;
    ui["forge-sell-button"].disabled = true;
    drawItemIcon(forgeIcon, null, "item");
    return;
  }
  const item = ITEMS[entry.definitionId];
  const rarity = RARITIES[item.rarity];
  const preview = getEnhancementPreview(entry);
  const check = canEnhanceEquipment(state.player, entry.uid);
  const equipped = Object.values(state.player.equipment).includes(entry.uid);
  ui["forge-rarity"].textContent = rarity.label.toUpperCase();
  ui["forge-rarity"].style.color = rarity.color;
  ui["forge-name"].textContent = item.name;
  ui["forge-level"].textContent = `Reforço +${entry.enhancementLevel}${preview ? ` → +${preview.cost.targetLevel}` : " · MÁXIMO"}`;
  ui["forge-stats"].replaceChildren(...forgeStatRows(preview?.before || calculateItemStats(entry), preview?.after || null));
  ui["forge-cost"].replaceChildren(...forgeCostNodes(preview?.cost || null));
  ui["forge-button"].disabled = forgeBusy || !check.ok;
  ui["forge-button"].textContent = preview ? `Reforçar para +${preview.cost.targetLevel}` : "Nível máximo";
  ui["forge-sell-button"].disabled = forgeBusy || equipped;
  ui["forge-sell-button"].textContent = equipped ? "Equipado" : `Vender por ${calculateSalePrice(entry)} ●`;
  if (!message && !check.ok) {
    ui["forge-message"].textContent = check.reason;
    ui["forge-message"].classList.remove("success");
  }
  drawItemIcon(forgeIcon, item);
}

function forgeStatRows(before, after) {
  const labels = { maxHp: "Vida máxima", attack: "Ataque", armor: "Armadura", crit: "Crítico", moveSpeed: "Movimento" };
  return Object.entries(labels).flatMap(([key, label]) => {
    if (!before[key] && !after?.[key]) return [];
    const row = document.createElement("div"); row.className = "forge-stat-row";
    row.innerHTML = `<span>${label}</span><b>${before[key]}</b><i>›</i><strong>${after ? after[key] : "—"}</strong>`;
    return [row];
  });
}

function forgeCostNodes(cost) {
  if (!cost) return [];
  const resources = [["coins", cost.gold], ...Object.entries(cost.materials)];
  return resources.map(([id, amount]) => {
    const available = id === "coins" ? state.player.coins : inventoryCount(state.player, id);
    const node = document.createElement("div");
    node.className = `forge-cost-item${available < amount ? " missing" : ""}`;
    node.innerHTML = `${id === "coins" ? "Moedas" : ITEMS[id].name}<strong>${available} / ${amount}</strong>`;
    return node;
  });
}

function reinforceSelectedEquipment() {
  if (forgeBusy || !selectedForgeUid) return;
  forgeBusy = true;
  const previousMaxHp = calculateStats(state.player).maxHp;
  const entry = getInventoryEntry(state.player, selectedForgeUid);
  const name = ITEMS[entry?.definitionId]?.name || "Equipamento";
  const result = enhanceEquipment(state.player, selectedForgeUid, { transactionId: `forge_${Date.now()}_${Math.random()}` });
  if (!result.ok) {
    renderForgeUI(result.reason, false);
    forgeBusy = false;
    return;
  }
  reconcileHealthAfterEquipment(previousMaxHp);
  forgeEffectTimer = .85;
  playTone(175, .07, .08, "square");
  window.setTimeout(() => playTone(470, .055, .16, "triangle"), 95);
  updateUI();
  saveGame(true);
  renderForgeUI(`${name} alcançou +${result.level}.`, true);
  window.setTimeout(() => { forgeBusy = false; if (ui["forge-dialog"].open) renderForgeUI(`${name} alcançou +${result.level}.`, true); }, 420);
}

function sellSelectedEquipment() {
  if (forgeBusy || !selectedForgeUid) return;
  forgeBusy = true;
  const entry = getInventoryEntry(state.player, selectedForgeUid);
  const name = ITEMS[entry?.definitionId]?.name || "Equipamento";
  const result = sellEquipment(state.player, selectedForgeUid, { transactionId: `sell_${Date.now()}_${Math.random()}` });
  if (!result.ok) {
    renderForgeUI(result.reason, false);
    forgeBusy = false;
    return;
  }
  selectedForgeUid = state.player.inventory.find(candidate => ITEMS[candidate.definitionId]?.type === "equipment")?.uid || null;
  playTone(390, .05, .11, "triangle");
  updateUI();
  saveGame(true);
  renderForgeUI(`${name} vendido por ${result.price} moedas.`, true);
  window.setTimeout(() => { forgeBusy = false; if (ui["forge-dialog"].open) renderForgeUI(); }, 320);
}

function formatItemStats(stats = {}) {
  const labels = { attack: "ATQ", armor: "ARM", maxHp: "VIDA", crit: "CRIT", moveSpeed: "MOV" };
  return Object.entries(stats).filter(([, value]) => value).map(([key, value]) => `${labels[key]} +${value}`).join(" · ");
}

function openInventory() {
  if (!playing || dialogOpen()) return;
  keys.clear();
  const selectedExists = getInventoryEntry(state.player, selectedInventoryUid);
  selectedInventoryUid = selectedExists?.uid || state.player.inventory[0]?.uid || null;
  renderInventoryUI();
  ui["inventory-dialog"].showModal();
  playTone(310, .035, .07, "triangle");
}

function toggleInventory() {
  if (ui["inventory-dialog"].open) ui["inventory-dialog"].close();
  else openInventory();
}

function openSkills() {
  if (!playing || dialogOpen()) return;
  keys.clear();
  renderSkillsUI();
  ui["skills-dialog"].showModal();
  playTone(355, .04, .08, "triangle");
}

function closeSkills() {
  if (ui["skills-dialog"].open) ui["skills-dialog"].close();
}

function renderSkillsUI(message = "") {
  ui["skill-points"].textContent = state.player.skillProgression.points;
  const nodes = { active: [], passive: [] };
  for (const [id, definition] of Object.entries(SKILLS)) {
    const level = getSkillLevel(state.player, id);
    const check = canUpgradeSkill(state.player, id);
    const card = document.createElement("article");
    card.className = `skill-card ${level ? "unlocked" : "locked"}`;
    const head = document.createElement("div"); head.className = "skill-card-head";
    const icon = document.createElement("canvas"); icon.width = 48; icon.height = 48;
    const title = document.createElement("h4");
    title.innerHTML = `${definition.name}<small>${level ? `NÍVEL ${level} / ${definition.maxLevel}` : "BLOQUEADA"}</small>`;
    head.append(icon, title); drawSkillIcon(icon, id);
    const description = document.createElement("p"); description.textContent = definition.description;
    const meta = document.createElement("div"); meta.className = "skill-meta";
    const details = skillDetails(definition, Math.max(1, level));
    const next = level < definition.maxLevel ? skillDetails(definition, level + 1) : "Nível máximo";
    meta.innerHTML = `<span>${details}</span><span>Próximo: ${next}</span>${message && message.startsWith(id) ? `<span>${message.slice(id.length + 1)}</span>` : ""}`;
    const button = document.createElement("button"); button.type = "button";
    button.disabled = !check.ok;
    button.textContent = level >= definition.maxLevel ? "Nível máximo" : `${level ? "Melhorar" : "Desbloquear"} · ${check.cost || definition.pointCosts[level] || 1} ponto${(check.cost || definition.pointCosts[level] || 1) === 1 ? "" : "s"}`;
    button.title = check.ok ? "" : check.reason;
    button.addEventListener("click", () => improveSkill(id));
    card.append(head, description, meta, button);
    nodes[definition.kind].push(card);
  }
  ui["active-skills-list"].replaceChildren(...nodes.active);
  ui["passive-skills-list"].replaceChildren(...nodes.passive);
  const mastery = state.player.weaponMastery.sword;
  const required = masteryExpRequired(mastery.level);
  ui["sword-mastery-level"].textContent = mastery.level;
  ui["sword-mastery-bar"].style.width = `${clamp(mastery.exp / required * 100, 0, 100)}%`;
  ui["sword-mastery-text"].textContent = `${Math.floor(mastery.exp)} / ${required} de experiência`;
  drawMasteryEmblem();
}

function improveSkill(id) {
  const previousMaxHp = calculateStats(state.player).maxHp;
  const result = upgradeSkill(state.player, id);
  if (!result.ok) return renderSkillsUI(`${id}:${result.reason}`);
  reconcileHealthAfterEquipment(previousMaxHp);
  playTone(520, .06, .13, "triangle");
  renderSkillsUI(`${id}:${SKILLS[id].name} alcançou o nível ${result.level}.`);
  updateUI();
  saveGame(true);
}

function skillDetails(definition, level) {
  if (definition.kind === "passive") {
    if (definition.effects.damageBonuses) return `Dano com espada +${Math.round(skillValue(definition, "damageBonuses", level) * 100)}%`;
    return `Armadura +${definition.effects.armorPerLevel * level} · Vida +${definition.effects.maxHpPerLevel * level}`;
  }
  const damage = Math.round(skillValue(definition, "damageMultipliers", level) * 100);
  return `${damage}% de dano · ${skillResourceCost(definition, level)} vigor · ${skillCooldown(definition, level).toFixed(1)}s`;
}

function drawSkillIcon(canvasElement, id) {
  const icon = canvasElement.getContext("2d");
  icon.imageSmoothingEnabled = false;
  icon.clearRect(0, 0, canvasElement.width, canvasElement.height);
  icon.fillStyle = "#10150f"; icon.fillRect(0, 0, 48, 48);
  icon.fillStyle = "#364032"; icon.fillRect(4, 4, 40, 40);
  icon.fillStyle = "#161b14"; icon.fillRect(7, 7, 34, 34);
  if (id === "golpe_poderoso") {
    icon.save(); icon.translate(23, 24); icon.rotate(-.72);
    icon.fillStyle = "#6a452a"; icon.fillRect(-18, -2, 14, 5); icon.fillStyle = "#d7b65d"; icon.fillRect(-5, -6, 4, 13);
    icon.fillStyle = "#d9dfdc"; icon.fillRect(-1, -4, 24, 8); icon.fillStyle = "#768181"; icon.fillRect(1, 2, 19, 3); icon.restore();
    icon.fillStyle = "#e5ad4e"; icon.fillRect(32, 8, 4, 10); icon.fillRect(37, 12, 4, 5);
  } else if (id === "corte_giratorio") {
    icon.strokeStyle = "#e4c66e"; icon.lineWidth = 5; icon.beginPath(); icon.arc(24, 25, 15, -.5, 4.5); icon.stroke();
    icon.fillStyle = "#dfe5df"; icon.fillRect(30, 7, 11, 5); icon.fillRect(38, 9, 5, 8);
    icon.fillStyle = "#875b36"; icon.fillRect(18, 20, 12, 9);
  } else if (id === "investida") {
    icon.fillStyle = "#dfe5df"; icon.fillRect(15, 20, 27, 7); icon.fillRect(37, 17, 7, 13);
    icon.fillStyle = "#d0ad56"; icon.fillRect(12, 16, 4, 15);
    icon.fillStyle = "#63877f"; icon.fillRect(5, 11, 5, 5); icon.fillRect(2, 22, 8, 5); icon.fillRect(6, 33, 6, 4);
  } else if (id === "treinamento_marcial") {
    icon.fillStyle = "#d8b55e"; icon.fillRect(11, 9, 5, 28); icon.fillRect(32, 9, 5, 28); icon.fillRect(8, 34, 12, 5); icon.fillRect(29, 34, 12, 5);
    icon.fillStyle = "#dfe5df"; icon.fillRect(14, 7, 4, 26); icon.fillRect(30, 7, 4, 26);
  } else {
    icon.fillStyle = "#8e9a91"; icon.fillRect(11, 12, 26, 22); icon.fillRect(16, 8, 16, 32);
    icon.fillStyle = "#d7c46b"; icon.fillRect(20, 14, 8, 15); icon.fillRect(15, 19, 18, 5);
  }
}

function drawMasteryEmblem() {
  const canvasElement = ui["mastery-emblem"];
  const icon = canvasElement.getContext("2d");
  icon.imageSmoothingEnabled = false; icon.clearRect(0, 0, 150, 150);
  icon.fillStyle = "#0e120d"; icon.fillRect(13, 13, 124, 124);
  icon.strokeStyle = "#756640"; icon.lineWidth = 4; icon.strokeRect(18, 18, 114, 114);
  icon.save(); icon.translate(75, 73); icon.rotate(-Math.PI / 4);
  icon.fillStyle = "#765039"; icon.fillRect(-45, -5, 35, 10);
  icon.fillStyle = "#d3ad55"; icon.fillRect(-13, -14, 8, 28);
  icon.fillStyle = "#dce3df"; icon.fillRect(-5, -8, 53, 16); icon.fillRect(43, -4, 12, 8);
  icon.fillStyle = "#7e8989"; icon.fillRect(1, 4, 42, 5); icon.restore();
  icon.fillStyle = "#c49c4b"; icon.font = "bold 16px monospace"; icon.textAlign = "center"; icon.fillText(`NV ${state.player.weaponMastery.sword.level}`, 75, 128);
}

function renderInventoryUI() {
  const p = state.player;
  const selected = getInventoryEntry(p, selectedInventoryUid);
  if (!selected && p.inventory.length) selectedInventoryUid = p.inventory[0].uid;
  ui["inventory-capacity"].textContent = `${inventoryUsed(p)} / ${inventoryCapacity(p)} espaços`;
  renderInventoryStats();
  renderEquipmentSlots();
  renderInventoryGrid();
  renderItemDetail();
}

function renderInventoryStats() {
  const breakdown = calculateStatBreakdown(state.player);
  const labels = { maxHp: "VIDA", attack: "ATAQUE", armor: "ARMADURA", crit: "CRÍTICO", moveSpeed: "MOVIMENTO" };
  ui["inventory-stats"].replaceChildren(...Object.entries(labels).map(([key, label]) => {
    const cell = document.createElement("div");
    cell.className = "inventory-stat";
    const bonus = breakdown.equipment[key];
    cell.innerHTML = `<span>${label}</span><strong>${breakdown.total[key]}${bonus ? `<small>+${bonus}</small>` : ""}</strong>`;
    return cell;
  }));
}

function renderEquipmentSlots() {
  const nodes = Object.entries(EQUIPMENT_SLOTS).map(([slot, slotDefinition]) => {
    const entry = getEquippedEntry(state.player, slot);
    const item = ITEMS[entry?.definitionId];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `equipment-slot${entry?.uid === selectedInventoryUid ? " selected" : ""}`;
    button.dataset.slot = slot;
    if (entry) button.dataset.uid = entry.uid;
    button.setAttribute("aria-label", `${slotDefinition.label}: ${item?.name || "vazio"}`);
    const icon = document.createElement("canvas");
    icon.width = 48; icon.height = 48;
    const copy = document.createElement("span");
    copy.innerHTML = `<span>${slotDefinition.label}</span><strong>${item?.name || "Vazio"}</strong>`;
    button.append(icon, copy);
    drawItemIcon(icon, item, slotDefinition.icon);
    if (entry) {
      button.addEventListener("click", () => selectInventoryEntry(entry.uid));
      attachItemTooltip(button, entry);
    }
    return button;
  });
  ui["equipment-slots"].replaceChildren(...nodes);
}

function renderInventoryGrid() {
  const equipped = new Set(Object.values(state.player.equipment).filter(Boolean));
  const nodes = state.player.inventory.map(entry => {
    const item = ITEMS[entry.definitionId];
    const rarity = RARITIES[item.rarity];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `inventory-item${entry.uid === selectedInventoryUid ? " selected" : ""}${equipped.has(entry.uid) ? " equipped" : ""}`;
    button.dataset.uid = entry.uid;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(entry.uid === selectedInventoryUid));
    button.setAttribute("aria-label", item.name);
    button.style.setProperty("--item-color", rarity.color);
    const icon = document.createElement("canvas");
    icon.width = 48; icon.height = 48;
    button.append(icon);
    if (entry.quantity > 1) button.insertAdjacentHTML("beforeend", `<span class="quantity">×${entry.quantity}</span>`);
    if (entry.isNew) button.insertAdjacentHTML("beforeend", '<span class="new-mark" aria-label="Novo">!</span>');
    if (equipped.has(entry.uid)) button.insertAdjacentHTML("beforeend", '<span class="equipped-mark" aria-label="Equipado">◆</span>');
    if (item.type === "equipment" && entry.enhancementLevel > 0) button.insertAdjacentHTML("beforeend", `<span class="enhancement-mark">+${entry.enhancementLevel}</span>`);
    drawItemIcon(icon, item);
    button.addEventListener("click", () => selectInventoryEntry(entry.uid));
    attachItemTooltip(button, entry);
    return button;
  });
  ui["inventory-grid"].replaceChildren(...nodes);
  ui["inventory-empty"].hidden = nodes.length > 0;
}

function selectInventoryEntry(uid) {
  const entry = getInventoryEntry(state.player, uid);
  if (!entry) return;
  selectedInventoryUid = uid;
  entry.isNew = false;
  renderInventoryUI();
}

function renderItemDetail() {
  const entry = getInventoryEntry(state.player, selectedInventoryUid);
  if (!entry) {
    ui["item-detail"].innerHTML = '<p class="detail-placeholder">Escolha um item da mochila ou um equipamento.</p>';
    return;
  }
  const item = ITEMS[entry.definitionId];
  const rarity = RARITIES[item.rarity];
  const isEquipment = item.type === "equipment";
  const equippedEntry = isEquipment ? getEquippedEntry(state.player, item.slot) : null;
  const isEquipped = equippedEntry?.uid === entry.uid;
  const check = isEquipment ? canEquipItem(state.player, entry.uid) : null;
  const ownStats = calculateItemStats(entry);
  const comparedStats = equippedEntry && !isEquipped ? calculateItemStats(equippedEntry) : null;
  const stats = Object.entries(ownStats).filter(([, value]) => value !== 0);
  const slotLabel = isEquipment ? EQUIPMENT_SLOTS[item.slot].label : item.type === "consumable" ? "Consumível" : "Material";
  const enhancement = isEquipment && entry.enhancementLevel ? ` · Reforço +${entry.enhancementLevel}` : "";
  const statLabels = { maxHp: "Vida máxima", attack: "Ataque", armor: "Armadura", crit: "Crítico", moveSpeed: "Movimento" };
  const statsMarkup = stats.length ? `<dl class="detail-stats">${stats.map(([key, value]) => {
    const difference = comparedStats ? value - comparedStats[key] : null;
    const comparison = difference === null || difference === 0 ? "" : ` <small>${difference > 0 ? "+" : ""}${difference}</small>`;
    return `<div><dt>${statLabels[key]}</dt><dd class="${difference < 0 ? "negative" : ""}">+${value}${comparison}</dd></div>`;
  }).join("")}</dl>` : "";
  const comparisonLabel = comparedStats ? `<span class="comparison-label">COMPARADO A ${ITEMS[equippedEntry.definitionId].name.toUpperCase()}</span>` : "";
  const action = isEquipment
    ? `<div class="detail-actions"><button type="button" data-inventory-action="${isEquipped ? "unequip" : "equip"}" ${!isEquipped && !check.ok ? "disabled" : ""}>${isEquipped ? "Desequipar" : "Equipar"}</button></div>`
    : "";
  ui["item-detail"].style.setProperty("--item-color", rarity.color);
  const sellValue = isEquipment ? calculateSalePrice(entry) : item.sellValue || 0;
  ui["item-detail"].innerHTML = `
    <span class="detail-rarity">${rarity.label}</span>
    <h3>${item.name}</h3>
    <p class="detail-meta">${slotLabel} · Nível ${item.requiredLevel || 1}${enhancement} · Venda ${sellValue} moedas</p>
    <p class="detail-description">${item.description || "Sem descrição."}</p>
    ${comparisonLabel}${statsMarkup}${action}
    ${check && !check.ok ? `<p class="detail-warning">${check.reason}</p>` : ""}`;
  ui["item-detail"].querySelector('[data-inventory-action="equip"]')?.addEventListener("click", equipSelectedItem);
  ui["item-detail"].querySelector('[data-inventory-action="unequip"]')?.addEventListener("click", unequipSelectedItem);
}

function equipSelectedItem() {
  const previousMaxHp = calculateStats(state.player).maxHp;
  const result = equipItem(state.player, selectedInventoryUid);
  if (!result.ok) return showToast(result.reason, true);
  reconcileHealthAfterEquipment(previousMaxHp);
  playTone(440, .045, .08, "triangle");
  showToast(`${ITEMS[getInventoryEntry(state.player, selectedInventoryUid).definitionId].name} equipado.`);
  renderInventoryUI(); updateUI(); saveGame(true);
}

function unequipSelectedItem() {
  const entry = getInventoryEntry(state.player, selectedInventoryUid);
  const slot = ITEMS[entry?.definitionId]?.slot;
  const previousMaxHp = calculateStats(state.player).maxHp;
  const result = unequipSlot(state.player, slot);
  if (!result.ok) return showToast(result.reason, true);
  reconcileHealthAfterEquipment(previousMaxHp);
  playTone(245, .035, .07, "triangle");
  showToast("Equipamento removido.");
  renderInventoryUI(); updateUI(); saveGame(true);
}

function reconcileHealthAfterEquipment(previousMaxHp) {
  const nextMaxHp = calculateStats(state.player).maxHp;
  if (nextMaxHp > previousMaxHp) state.player.hp += nextMaxHp - previousMaxHp;
  state.player.hp = clamp(state.player.hp, 0, nextMaxHp);
}

function attachItemTooltip(element, entry) {
  const show = event => showItemTooltip(entry, event);
  element.addEventListener("pointerenter", show);
  element.addEventListener("pointermove", positionItemTooltip);
  element.addEventListener("pointerleave", hideItemTooltip);
  element.addEventListener("focus", show);
  element.addEventListener("blur", hideItemTooltip);
}

function showItemTooltip(entry, event) {
  const item = ITEMS[entry.definitionId];
  const rarity = RARITIES[item.rarity];
  const stats = Object.entries(calculateItemStats(entry)).filter(([, value]) => value).map(([key, value]) => `${formatStatName(key)} +${value}`).join(" · ");
  ui["item-tooltip"].style.setProperty("--item-color", rarity.color);
  const enhancement = item.type === "equipment" && entry.enhancementLevel ? ` +${entry.enhancementLevel}` : "";
  ui["item-tooltip"].innerHTML = `<strong>${item.name}${enhancement}</strong>${rarity.label}${stats ? `<br>${stats}` : ""}`;
  ui["item-tooltip"].hidden = false;
  positionItemTooltip(event);
}

function positionItemTooltip(event) {
  if (ui["item-tooltip"].hidden) return;
  const source = event.currentTarget?.getBoundingClientRect?.();
  const desiredX = Number.isFinite(event.clientX) ? event.clientX + 14 : (source?.right || 12) + 8;
  const desiredY = Number.isFinite(event.clientY) ? event.clientY + 14 : source?.top || 12;
  const bounds = ui["item-tooltip"].getBoundingClientRect();
  ui["item-tooltip"].style.left = `${clamp(desiredX, 8, window.innerWidth - bounds.width - 8)}px`;
  ui["item-tooltip"].style.top = `${clamp(desiredY, 8, window.innerHeight - bounds.height - 8)}px`;
}

function hideItemTooltip() { ui["item-tooltip"].hidden = true; }

function formatStatName(key) {
  return ({ maxHp: "Vida", attack: "Ataque", armor: "Armadura", crit: "Crítico", moveSpeed: "Movimento" })[key] || key;
}

function drawItemIcon(canvasElement, item, fallbackKind = "item") {
  const icon = canvasElement.getContext("2d");
  icon.imageSmoothingEnabled = false;
  icon.clearRect(0, 0, 48, 48);
  const visual = item?.visual || { kind: fallbackKind, primary: "#687064", accent: "#b69c57" };
  const kind = visual.kind || fallbackKind;
  const primary = visual.primary || visual.metal || "#8c9693";
  const accent = visual.accent || "#d0b15b";
  icon.fillStyle = "#12150f"; icon.fillRect(0, 0, 48, 48);
  if (kind === "sword" || kind === "weapon") {
    icon.save(); icon.translate(8, 38); icon.rotate(-Math.PI / 4);
    icon.fillStyle = "#5a3926"; icon.fillRect(0, -3, 11, 6);
    icon.fillStyle = accent; icon.fillRect(9, -7, 5, 14);
    icon.fillStyle = visual.metal || primary; icon.fillRect(14, -4, 22, 8); icon.fillRect(36, -2, 5, 4);
    icon.fillStyle = "#ffffff55"; icon.fillRect(17, -2, 17, 2); icon.restore();
  } else if (kind === "helmet") {
    if (visual.style === "antler_crown") {
      icon.fillStyle = accent; icon.fillRect(11, 27, 26, 7);
      icon.fillStyle = primary; icon.fillRect(15, 12, 4, 17); icon.fillRect(29, 10, 4, 19);
      icon.fillRect(9, 13, 10, 4); icon.fillRect(31, 11, 9, 4); icon.fillRect(8, 7, 4, 9); icon.fillRect(37, 5, 4, 9);
    } else {
      icon.fillStyle = primary; icon.fillRect(12, 15, 24, 18); icon.fillRect(16, 10, 16, 7);
      icon.fillStyle = accent; icon.fillRect(15, 15, 18, 4); icon.fillRect(12, 31, 7, 6); icon.fillRect(29, 31, 7, 6);
      icon.fillStyle = "#12150f"; icon.fillRect(19, 24, 10, 5);
    }
  } else if (kind === "chest") {
    icon.fillStyle = primary; icon.fillRect(13, 13, 22, 27); icon.fillRect(8, 17, 7, 15); icon.fillRect(33, 17, 7, 15);
    icon.fillStyle = accent; icon.fillRect(15, 17, 18, 4); icon.fillRect(22, 14, 4, 25); icon.fillRect(13, 34, 22, 5);
  } else if (kind === "boots") {
    icon.fillStyle = primary; icon.fillRect(10, 13, 10, 23); icon.fillRect(28, 13, 10, 23); icon.fillRect(7, 33, 16, 7); icon.fillRect(25, 33, 16, 7);
    icon.fillStyle = accent; icon.fillRect(10, 18, 10, 4); icon.fillRect(28, 18, 10, 4);
  } else if (kind === "ring") {
    icon.strokeStyle = primary; icon.lineWidth = 6; icon.beginPath(); icon.arc(24, 27, 11, 0, Math.PI * 2); icon.stroke();
    icon.fillStyle = accent; icon.fillRect(19, 9, 10, 10); icon.fillStyle = "#fff7"; icon.fillRect(21, 11, 3, 3);
  } else if (kind === "amulet") {
    icon.strokeStyle = primary; icon.lineWidth = 3; icon.beginPath(); icon.arc(24, 20, 13, Math.PI, 0); icon.stroke();
    icon.fillStyle = primary; icon.fillRect(22, 18, 4, 10); icon.fillStyle = accent; icon.fillRect(17, 26, 14, 13); icon.fillRect(20, 23, 8, 5);
  } else if (kind === "potion") {
    icon.fillStyle = "#b9ae89"; icon.fillRect(19, 9, 10, 7); icon.fillStyle = "#6d302e"; icon.fillRect(14, 18, 20, 22);
    icon.fillStyle = "#d75d58"; icon.fillRect(17, 23, 14, 13); icon.fillStyle = "#f3aaa3"; icon.fillRect(19, 24, 4, 4);
  } else if (kind === "material") {
    if (visual.style === "goblin_essence") {
      icon.fillStyle = primary; icon.fillRect(16, 18, 17, 20); icon.fillRect(20, 12, 9, 8); icon.fillRect(13, 25, 5, 8);
      icon.fillStyle = accent; icon.fillRect(20, 17, 7, 13); icon.fillRect(25, 10, 4, 6); icon.fillRect(29, 23, 5, 6);
    } else if (visual.style === "rare_crystal") {
      icon.fillStyle = primary; icon.fillRect(18, 11, 13, 29); icon.fillRect(12, 22, 9, 16); icon.fillRect(29, 18, 7, 20);
      icon.fillStyle = accent; icon.fillRect(21, 14, 4, 19); icon.fillRect(15, 24, 3, 9); icon.fillRect(31, 21, 3, 11);
    } else if (visual.style === "ash_sap") {
      icon.fillStyle = "#473229"; icon.fillRect(14, 12, 20, 28); icon.fillRect(18, 8, 12, 7);
      icon.fillStyle = primary; icon.fillRect(17, 17, 14, 19); icon.fillRect(12, 27, 6, 8);
      icon.fillStyle = accent; icon.fillRect(20, 19, 5, 13); icon.fillRect(27, 25, 4, 6);
    } else if (visual.style === "living_ash") {
      icon.fillStyle = primary; icon.fillRect(11, 28, 27, 10); icon.fillRect(16, 20, 18, 9); icon.fillRect(21, 14, 9, 7);
      icon.fillStyle = accent; icon.fillRect(17, 26, 5, 5); icon.fillRect(27, 19, 4, 7); icon.fillRect(23, 10, 4, 6);
    } else {
      icon.fillStyle = primary; icon.fillRect(12, 19, 24, 17); icon.fillRect(17, 13, 14, 8);
      icon.fillStyle = accent; icon.fillRect(17, 18, visual.style === "steel" ? 16 : 11, 5); icon.fillRect(13, 28, 6, 4);
    }
  } else {
    icon.fillStyle = primary; icon.fillRect(13, 13, 22, 22); icon.fillStyle = accent; icon.fillRect(19, 19, 10, 10);
  }
}

function openRegions() {
  if (!playing || state.world.scene !== "village" || dialogOpen()) return;
  keys.clear();
  ui["region-grid"].replaceChildren(...Object.entries(GAME_CONFIG.regions).sort((a, b) => a[1].order - b[1].order).map(([id, definition]) => {
    const status = regionUnlockStatus(state.world, id);
    const progress = state.world.regionProgress[id];
    const card = document.createElement("article");
    card.className = `region-card${status.unlocked ? "" : " locked"}${definition.status === "planned" ? " planned" : ""}`;
    card.style.setProperty("--region-color", id === "bosque_cinzas" ? "#a45e3d" : id === "caverna_sombria" ? "#7b815f" : "#55584d");
    const descriptions = {
      caverna_sombria: "Vinte salões goblins sob a pedra negra.", bosque_cinzas: "Árvores queimadas, feras sombrias e raízes que ainda respiram.",
      montanhas_lamento: "Picos antigos aguardam uma futura expedição.", catacumbas_esquecidas: "Os mortos permanecem preparados em dados.", fortaleza_eclipse: "A cidadela final permanece além do horizonte."
    };
    const buttonLabel = definition.status === "planned" ? "Em preparação" : status.unlocked ? "Viajar" : status.reason;
    const floorOptions = status.unlocked && progress
      ? `<label class="region-floor-select">ANDAR <select id="region-floor-${id}" name="region-floor-${id}" aria-label="Andar de ${definition.name}">${Array.from({ length: progress.highestUnlockedFloor }, (_, index) => index + 1).map(floor => `<option value="${floor}" ${floor === progress.selectedFloor ? "selected" : ""}>${floor}</option>`).join("")}</select></label>`
      : "";
    card.innerHTML = `<span class="eyebrow">REGIÃO ${String(definition.order).padStart(2, "0")}</span><h3>${definition.name}</h3><p>${descriptions[id]}</p><dl><div><dt>NÍVEL RECOMENDADO</dt><dd>${definition.recommendedLevel.join("–")}</dd></div><div><dt>PROGRESSO</dt><dd>${progress ? `${progress.highestUnlockedFloor} / ${getRegionConfig(id).totalFloors}` : "—"}</dd></div></dl>${floorOptions}<button type="button" ${status.unlocked ? "" : "disabled"}>${buttonLabel}</button>`;
    card.querySelector("button").addEventListener("click", () => enterRegion(id, card.querySelector("select")?.value));
    return card;
  }));
  ui["region-dialog"].showModal();
}

function enterRegion(regionId, requestedFloor = null) {
  const status = regionUnlockStatus(state.world, regionId);
  if (!status.unlocked) return showToast(status.reason, true);
  state.world.currentRegionId = regionId;
  if (requestedFloor != null) {
    const selection = selectCaveFloor(currentRegionProgress(), requestedFloor, currentRegionConfig());
    if (!selection.ok) return showToast(selection.reason, true);
  }
  if (ui["region-dialog"].open) ui["region-dialog"].close();
  enterCave();
}

function enterCave() {
  const config = currentRegionConfig();
  const floor = beginCaveExpedition(currentRegionProgress(), config);
  state.world.scene = "cave";
  state.world.caveVisits += 1;
  state.player.x = 480;
  state.player.y = 444;
  state.player.dirX = 0;
  state.player.dirY = -1;
  startFloorEncounter(1.25);
  attackTimer = 0;
  attackHitPending = false;
  dodgeTimer = 0;
  dodgeCooldownTimer = 0;
  invulnerableTimer = 0;
  transitionFlash = 1;
  keys.clear();
  updateUI();
  showToast(`${currentRegionDefinition().name} · estágio ${floor}`);
  playTone(82, .08, .3, "sawtooth");
  saveGame();
}

function exitCave() {
  if (ui["encounter-dialog"].open) ui["encounter-dialog"].close();
  abandonCaveExpedition(currentRegionProgress());
  state.world.scene = "village";
  state.player.x = 750;
  state.player.y = 225;
  state.player.dirX = -1;
  state.player.dirY = 1;
  clearEncounterRuntime();
  attackTimer = 0;
  attackHitPending = false;
  dodgeTimer = 0;
  dodgeCooldownTimer = 0;
  invulnerableTimer = 0;
  transitionFlash = 1;
  keys.clear();
  updateUI();
  showToast("Você retornou à segurança da clareira.");
  saveGame(true);
}

function startFloorEncounter(delay = .85) {
  clearEncounterRuntime("spawning");
  const config = currentRegionConfig();
  const progress = currentRegionProgress();
  const floor = progress.selectedFloor || beginCaveExpedition(progress, config);
  encounter.spec = createEncounterSpec(floor, config);
  farmRuntime = createFarmRuntime(config.id, floor, config, { id: encounter.id, initialDelay: delay });
  updateUI();
}

function spawnEnemy(spawnRequest) {
  if (!spawnRequest || !farmRuntime) return false;
  const spec = createEncounterSpec(farmRuntime.floor, currentRegionConfig(), spawnRequest.roleId);
  const positions = GAME_CONFIG.goblin.spawnPositions.filter(([spawnX, spawnY]) => !isCaveBlocked(spawnX, spawnY, spec.boss ? 24 : 14));
  if (!positions.length) {
    console.error("[KnightFall] Nenhum ponto válido para criar o inimigo.");
    farmRuntime.spawnTimer = 1;
    return false;
  }
  const available = positions.filter(([spawnX, spawnY]) => distance({ x: spawnX, y: spawnY }, state.player) > 170
    && encounter.enemies.every(enemy => distance({ x: spawnX, y: spawnY }, enemy) > 72));
  const pool = available.length ? available : positions;
  const [x, y] = pool[(spawnRequest.waveIndex + spawnRequest.id.length + state.world.caveVisits) % pool.length];
  encounter.enemies.push({
    id: spawnRequest.id, name: spec.name, x, y, hp: spec.hp, maxHp: spec.hp,
    level: spec.floor, speed: spec.speed, attack: spec.attack, facing: x > state.player.x ? -1 : 1,
    spec, phase: 1, phaseChanged: false, patternIndex: 0, state: ENEMY_STATES.PATROL,
    stateTimer: .5, stateDuration: .5, moving: false, attackAnimation: 0, hitApplied: false,
    attackKind: null, lockedTarget: null, chargeDir: null, hurtTimer: 0, navPath: [], navTimer: 0,
    rewardGranted: false, deathTimer: 0, deathDuration: spec.boss ? 1.65 : .78
  });
  encounter.status = "active";
  updateUI();
  if (spec.boss) showToast(`${spec.name} surgiu!`);
  return true;
}

function playerAttack() {
  if (!playing || dialogOpen() || attackTimer > 0 || dodgeTimer > 0 || skillRuntime.active) return;
  attackTimer = PLAYER_ATTACK_DURATION;
  attackHitPending = true;
  skillRuntime.eventSequence += 1;
  basicAttackEventId = `basic_${skillRuntime.eventSequence}`;
  playTone(130, .045, .06, "sawtooth");
}

function playerDodge() {
  if (!playing || dialogOpen() || dodgeTimer > 0 || dodgeCooldownTimer > 0 || attackTimer > 0) return false;
  if (skillRuntime.active && !cancelSkill(skillRuntime)) return false;
  let dx = 0;
  let dy = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;
  if (!dx && !dy) { dx = state.player.dirX; dy = state.player.dirY; }
  const length = Math.max(1, Math.hypot(dx, dy));
  dodgeDirX = dx / length;
  dodgeDirY = dy / length;
  state.player.dirX = dodgeDirX;
  state.player.dirY = dodgeDirY;
  if (Math.abs(dodgeDirX) > .1) state.player.facing = dodgeDirX > 0 ? 1 : -1;
  dodgeTimer = GAME_CONFIG.combat.dodgeDuration;
  dodgeCooldownTimer = GAME_CONFIG.combat.dodgeCooldown;
  invulnerableTimer = Math.max(invulnerableTimer, GAME_CONFIG.combat.dodgeInvulnerabilitySeconds);
  playTone(185, .035, .06, "triangle");
  return true;
}

function resolvePlayerAttack() {
  for (const enemy of encounter.enemies) {
    if (enemy.state === ENEMY_STATES.DYING) continue;
    const dx = enemy.x - state.player.x;
    const dy = enemy.y - state.player.y;
    const dist = Math.hypot(dx, dy);
    const dot = dist ? (dx / dist) * state.player.dirX + (dy / dist) * state.player.dirY : 1;
    const radiusBonus = enemy.spec.boss ? 18 : 0;
    if (dist > GAME_CONFIG.combat.playerRange + radiusBonus || dot <= .05) continue;
    applyPlayerDamage(enemy, 1, `${basicAttackEventId}:${enemy.id}`);
  }
  updateUI();
}

function activatePlayerSkill(id) {
  if (!playing || dialogOpen() || state.world.scene !== "cave" || encounter.status !== "active") {
    showToast("Habilidades ofensivas exigem um combate ativo.", true); return false;
  }
  if (attackTimer > 0 || dodgeTimer > 0) return false;
  const result = beginSkill(state.player, id, skillRuntime, { x: state.player.dirX, y: state.player.dirY });
  if (!result.ok) { showToast(result.reason, true); return false; }
  state.player.dirX = result.active.direction.x;
  state.player.dirY = result.active.direction.y;
  if (Math.abs(state.player.dirX) > .1) state.player.facing = state.player.dirX > 0 ? 1 : -1;
  playTone(id === "investida" ? 185 : id === "corte_giratorio" ? 150 : 105, .055, .09, "sawtooth");
  updateSkillHotbar();
  return true;
}

function updateActiveSkill(dt) {
  const active = skillRuntime.active;
  if (!active) return;
  const definition = SKILLS[active.id];
  active.elapsed += dt;
  active.phase = skillPhaseAt(definition, active.elapsed);
  if (active.phase === "active") {
    if (active.id === "investida") updateChargeSkill(active, definition, dt);
    else if (!active.damageWindowResolved) {
      active.damageWindowResolved = true;
      resolveSkillHits(active, definition);
    }
  }
  if (active.phase === "complete") skillRuntime.active = null;
}

function updateChargeSkill(active, definition, dt) {
  const remaining = definition.effects.range - active.distanceMoved;
  if (remaining <= 0) return;
  const intended = Math.min(definition.effects.speed * dt, remaining);
  const beforeX = state.player.x; const beforeY = state.player.y;
  movePlayer(active.direction.x * intended, active.direction.y * intended);
  const moved = Math.hypot(state.player.x - beforeX, state.player.y - beforeY);
  active.distanceMoved += moved;
  resolveSkillHits(active, definition);
  if (moved < intended * .35) {
    active.collisionStopped = true;
    active.elapsed = Math.max(active.elapsed, definition.phases.anticipation + definition.phases.active);
  }
}

function resolveSkillHits(active, definition) {
  for (const enemy of encounter.enemies) {
    if (enemy.state === ENEMY_STATES.DYING || active.hitTargets.has(enemy.id)) continue;
    const bossRadius = enemy.spec.boss ? 18 : 0;
    if (!skillTargetHit(active, definition, state.player, enemy, bossRadius)) continue;
    active.hitTargets.add(enemy.id);
    const multiplier = skillValue(definition, "damageMultipliers", active.level);
    applyPlayerDamage(enemy, multiplier, `${active.eventId}:${enemy.id}`, active.id);
  }
  updateUI();
}

function applyPlayerDamage(enemy, multiplier, eventId, source = "basic") {
  if (!enemy || enemy.state === ENEMY_STATES.DYING) return 0;
  const [minimum, maximum] = GAME_CONFIG.combat.playerDamageVariance;
  const baseDamage = calculateStats(state.player).attack * outgoingDamageMultiplier(state.player);
  const damage = Math.max(1, Math.round(baseDamage * multiplier * randomBetween(minimum, maximum)));
  enemy.hp = Math.max(0, enemy.hp - damage);
  enemy.hurtTimer = source === "golpe_poderoso" ? .3 : .2;
  if (enemy.hp > 0) {
    enemy.state = ENEMY_STATES.HURT;
    enemy.stateTimer = source === "golpe_poderoso" ? .26 : .18;
    enemy.stateDuration = enemy.stateTimer;
  }
  const mastery = awardMasteryForHit(state.player, masteryTracker, {
    eventId, encounterId: encounter.id, targetId: enemy.id, damage, targetMaxHp: enemy.maxHp
  });
  if (mastery.after > mastery.before) addFloater(state.player.x, state.player.y - 82, `ESPADA NV ${mastery.after}`, "#8fc4bd");
  addFloater(enemy.x, enemy.y - 72, `−${damage}`, source === "basic" ? "#f0c783" : "#ffe39a");
  burst(enemy.x, enemy.y - 28, source === "investida" ? "#8fc4bd" : "#d9b76a", source === "golpe_poderoso" ? 13 : 8);
  playTone(source === "golpe_poderoso" ? 58 : 72, .075, .08, "square");
  if (enemy.hp <= 0) beginEnemyDeath(enemy);
  return damage;
}

function beginEnemyDeath(defeated) {
  if (defeated.rewardGranted || !farmRuntime || !claimEnemyReward(farmRuntime, defeated.id)) return;
  defeated.rewardGranted = true;
  defeated.state = ENEMY_STATES.DYING;
  defeated.stateTimer = defeated.deathDuration;
  defeated.stateDuration = defeated.deathDuration;
  defeated.deathTimer = defeated.deathDuration;
  defeated.moving = false;

  const regionProgress = currentRegionProgress();
  const regionConfig = currentRegionConfig();
  const reward = grantEncounterRewards(regionProgress, defeated.spec);
  const bonus = reward.firstVictory || { xp: 0, coins: 0, items: [] };
  const totalCoins = reward.coins + bonus.coins;
  const totalXp = reward.xp + bonus.xp;
  state.player.coins += totalCoins;
  state.player.progression.kills += 1;
  addFloater(defeated.x, defeated.y - 92, `+${totalCoins} moedas`, "#f5d787");
  addFloater(defeated.x, defeated.y - 108, `+${totalXp} XP`, "#9fc7dc");
  burst(defeated.x, defeated.y - 30, defeated.spec.boss ? "#e0b84f" : "#81964f", defeated.spec.boss ? 32 : 14);
  playTone(220, .07, .12, "triangle");
  window.setTimeout(() => playTone(330, .05, .14, "triangle"), 90);

  const progression = grantPlayerExperience(state.player, totalXp);
  const drops = [...reward.loot, ...bonus.items];
  const collected = [];
  const missed = [];
  for (const drop of drops) {
    let added = addInventoryItem(state.player, drop.definitionId, drop.quantity);
    if (!added && bonus.items.includes(drop)) {
      state.player.bag.capacity += 1;
      added = addInventoryItem(state.player, drop.definitionId, drop.quantity);
    }
    (added ? collected : missed).push(ITEMS[drop.definitionId].name);
  }
  if (progression.levels) {
    state.player.hp = calculateStats(state.player).maxHp;
  }
  const progressResult = recordFloorKill(regionProgress, defeated.spec.floor, regionConfig, { boss: defeated.spec.boss });
  encounter.rewardResults.push({ enemyId: defeated.id, ...reward, totalXp, totalCoins, collected, missed, progression, progress: progressResult });
  if (encounter.rewardResults.length > 30) encounter.rewardResults.shift();
  const messages = [];
  if (progressResult.unlocked) messages.push(`Andar ${progressResult.nextFloor} desbloqueado — o farm continua aqui.`);
  if (defeated.spec.boss) messages.push(`${defeated.name} derrotado. Ele retornará para outro desafio.`);
  if (collected.length) messages.push(`Loot: ${collected.join(", ")}.`);
  if (missed.length) messages.push(`Mochila cheia: ${missed.join(", ")}.`);
  if (messages.length) showToast(messages.join(" "), missed.length > 0 && !collected.length);
  updateUI();
  saveGame();
}

function finalizeEnemyDeath(defeated) {
  encounter.enemies = encounter.enemies.filter(enemy => enemy.id !== defeated.id);
  if (!encounter.enemies.length && currentRegionConfig().farm?.continuous !== true) {
    encounter.status = "complete";
    showEncounterComplete();
  }
  updateUI();
}

function showEncounterComplete() {
  const result = encounter.rewardResults[encounter.rewardResults.length - 1];
  if (!result || ui["encounter-dialog"].open) return;
  const boss = encounter.spec.boss;
  ui["encounter-kicker"].textContent = boss ? "CHEFE DERROTADO" : `ESTÁGIO ${encounter.spec.floor} CONCLUÍDO`;
  ui["encounter-title"].textContent = boss ? `${encounter.spec.name} foi derrotado` : "O caminho adiante está aberto";
  ui["encounter-summary"].textContent = boss
    ? `${currentRegionDefinition().name} foi vencida. O confronto pode ser repetido.`
    : `O estágio ${result.progress.nextFloor} está disponível nesta expedição.`;
  const itemText = result.collected.length ? `<span class="loot-summary">◆ ${result.collected.join(", ")}</span>` : "";
  const missedText = result.missed.length ? `<small class="loot-missed">Mochila cheia: ${result.missed.join(", ")}</small>` : "";
  ui["encounter-rewards"].innerHTML = `<span>✦ ${result.totalXp} XP</span><span>● ${result.totalCoins} moedas</span>${itemText}${missedText}`;
  ui["advance-floor-button"].textContent = boss ? "Enfrentar novamente" : `Avançar ao estágio ${result.progress.nextFloor}`;
  keys.clear();
  ui["encounter-dialog"].showModal();
}

function advanceEncounter() {
  const result = encounter.rewardResults[encounter.rewardResults.length - 1];
  if (!ui["encounter-dialog"].open || !result) return;
  ui["encounter-dialog"].close();
  if (result.progress.nextFloor) selectCaveFloor(currentRegionProgress(), result.progress.nextFloor, currentRegionConfig());
  state.player.x = 480;
  state.player.y = 444;
  state.player.dirX = 0;
  state.player.dirY = -1;
  transitionFlash = 1;
  startFloorEncounter(.9);
  saveGame();
}

function usePotion() {
  if (!playing || dialogOpen()) return;
  const p = state.player;
  const maxHp = calculateStats(p).maxHp;
  if (!inventoryCount(p, "pocao_menor")) return showToast("Você não possui poções.", true);
  if (p.hp >= maxHp) return showToast("Sua vida já está cheia.");
  removeInventoryItem(p, "pocao_menor", 1);
  const healed = Math.min(ITEMS.pocao_menor.heal, maxHp - p.hp);
  p.hp += healed;
  addFloater(p.x, p.y - 90, `+${Math.ceil(healed)} vida`, "#8fd080");
  burst(p.x, p.y - 25, "#7ec86d", 10);
  playTone(390, .05, .16, "sine");
  updateUI();
  saveGame();
}

function buyItem(kind) {
  const p = state.player;
  if (kind === "damage" && p.progression.upgrades.attack >= GAME_CONFIG.economy.attackUpgrade.maxPurchases) return showToast("Treino de ataque já está no limite.", true);
  if (kind === "armor" && p.progression.upgrades.armor >= GAME_CONFIG.economy.armorUpgrade.maxPurchases) return showToast("Treino de defesa já está no limite.", true);
  const purchases = {
    damage: {
      price: damagePrice(),
      apply: () => {
        p.baseStats.attack += GAME_CONFIG.economy.attackUpgrade.amount;
        p.progression.upgrades.attack += 1;
      },
      message: `Espada afiada: +${GAME_CONFIG.economy.attackUpgrade.amount} de ataque.`
    },
    armor: {
      price: armorPrice(),
      apply: () => {
        p.baseStats.armor += GAME_CONFIG.economy.armorUpgrade.amount;
        p.progression.upgrades.armor += 1;
      },
      message: `Armadura reforçada: +${GAME_CONFIG.economy.armorUpgrade.amount} de defesa.`
    },
    potion: {
      price: GAME_CONFIG.economy.potionPrice,
      apply: () => addInventoryItem(p, "pocao_menor", 1),
      message: "Poção adicionada à mochila."
    },
    heal: {
      price: GAME_CONFIG.economy.restPrice,
      apply: () => { p.hp = calculateStats(p).maxHp; },
      message: "Você descansou e recuperou toda a vida."
    }
  };
  const purchase = purchases[kind];
  if (!purchase || p.coins < purchase.price) return showToast("Moedas insuficientes.", true);
  if (kind === "heal" && p.hp >= calculateStats(p).maxHp) return;
  if (kind === "potion" && !p.inventory.some(entry => entry.definitionId === "pocao_menor") && inventoryUsed(p) >= inventoryCapacity(p)) {
    return showToast("A mochila está cheia.", true);
  }
  p.coins -= purchase.price;
  const applied = purchase.apply();
  if (applied === false) { p.coins += purchase.price; return showToast("A mochila está cheia.", true); }
  playTone(520, .055, .1, "triangle");
  showToast(purchase.message);
  updateUI();
  saveGame(true);
}

function takeDamage(amount) {
  if (invulnerableTimer > 0) return;
  const damage = Math.max(GAME_CONFIG.combat.minimumDamageTaken, Math.round(amount - calculateStats(state.player).armor));
  state.player.hp -= damage;
  invulnerableTimer = GAME_CONFIG.combat.invulnerabilitySeconds;
  addFloater(state.player.x, state.player.y - 92, `−${damage}`, "#f17b6b");
  burst(state.player.x, state.player.y - 30, "#a63f38", 8);
  playTone(58, .095, .12, "square");
  if (state.player.hp <= 0) playerDefeated();
  updateUI();
}

function playerDefeated() {
  state.player.hp = 0;
  keys.clear();
  abandonCaveExpedition(currentRegionProgress());
  clearEncounterRuntime();
  dodgeTimer = 0;
  dodgeCooldownTimer = 0;
  invulnerableTimer = 0;
  const lost = Math.min(state.player.coins, Math.max(
    GAME_CONFIG.economy.defeatMinimumCoinLoss,
    Math.floor(state.player.coins * GAME_CONFIG.economy.defeatCoinLossRatio)
  ));
  state.player.coins -= lost;
  updateUI();
  window.setTimeout(() => ui["death-dialog"].showModal(), 180);
  saveGame();
}

function returnToVillage() {
  abandonCaveExpedition(currentRegionProgress());
  state.world.scene = "village";
  state.player.x = 250;
  state.player.y = 365;
  state.player.hp = Math.max(50, Math.round(calculateStats(state.player).maxHp * .6));
  clearEncounterRuntime();
  dodgeTimer = 0;
  dodgeCooldownTimer = 0;
  invulnerableTimer = 0;
  transitionFlash = 1;
  updateUI();
  showToast("Bram trouxe você de volta. Recupere-se e tente de novo.");
  saveGame(true);
}

function dialogOpen() {
  return ui["merchant-dialog"].open || ui["inventory-dialog"].open || ui["forge-dialog"].open
    || ui["skills-dialog"].open || ui["death-dialog"].open || ui["encounter-dialog"].open
    || ui["region-dialog"].open;
}

function update(dt) {
  elapsed += dt;
  transitionFlash = Math.max(0, transitionFlash - dt * 2.1);
  forgeEffectTimer = Math.max(0, forgeEffectTimer - dt);

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) ui.toast.classList.remove("visible");
  }

  updateParticles(dt);
  if (!playing || dialogOpen()) { moving = false; return; }

  tickSkillRuntime(state.player, skillRuntime, dt);
  updateActiveSkill(dt);
  attackTimer = Math.max(0, attackTimer - dt);
  dodgeTimer = Math.max(0, dodgeTimer - dt);
  dodgeCooldownTimer = Math.max(0, dodgeCooldownTimer - dt);
  if (attackHitPending && attackTimer <= PLAYER_ATTACK_DURATION * GAME_CONFIG.combat.playerHitAt) {
    attackHitPending = false;
    resolvePlayerAttack();
  }
  invulnerableTimer = Math.max(0, invulnerableTimer - dt);

  let dx = 0;
  let dy = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;
  const skillLocksMovement = Boolean(skillRuntime.active);
  moving = dodgeTimer > 0 || skillRuntime.active?.id === "investida" && skillRuntime.active.phase === "active" || (!skillLocksMovement && (dx !== 0 || dy !== 0));
  if (dodgeTimer > 0) {
    const dodgeSpeed = calculateStats(state.player).moveSpeed * GAME_CONFIG.combat.dodgeSpeedMultiplier;
    movePlayer(dodgeDirX * dodgeSpeed * dt, dodgeDirY * dodgeSpeed * dt);
  } else if (moving && !skillLocksMovement) {
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;
    state.player.dirX = dx;
    state.player.dirY = dy;
    if (Math.abs(dx) > .1) state.player.facing = dx > 0 ? 1 : -1;
    const speed = calculateStats(state.player).moveSpeed;
    movePlayer(dx * speed * dt, dy * speed * dt);
  }

  updateSkillHotbar();

  updateInteractionPrompt();

  if (state.world.scene === "cave") {
    pathfindBudget = currentRegionConfig().farm?.maxPathfindsPerFrame || 1;
    const spawnRequest = farmRuntime ? updateFarmSpawner(farmRuntime, dt, encounter.enemies.length) : null;
    if (spawnRequest) spawnEnemy(spawnRequest);
    encounter.enemies.slice().forEach(enemy => updateEnemy(enemy, dt));
    separateEnemies();
    updateProjectiles(dt);
  }

  saveTimer += dt;
  if (saveTimer > 8) { saveTimer = 0; saveGame(); }
}

function movePlayer(dx, dy) {
  const p = state.player;
  const bounds = state.world.scene === "village"
    ? { left: 42, right: 918, top: 105, bottom: 505 }
    : { left: 73, right: 887, top: 112, bottom: 496 };
  const isBlocked = state.world.scene === "village" ? isVillageBlocked : isCaveBlocked;
  const nextX = clamp(p.x + dx, bounds.left, bounds.right);
  const nextY = clamp(p.y + dy, bounds.top, bounds.bottom);
  if (!isBlocked(nextX, p.y, 15)) p.x = nextX;
  if (!isBlocked(p.x, nextY, 15)) p.y = nextY;
}

function updateEnemy(enemy, dt) {
  if (!encounter.enemies.includes(enemy)) return;
  enemy.hurtTimer = Math.max(0, enemy.hurtTimer - dt);
  enemy.stateTimer = Math.max(0, enemy.stateTimer - dt);
  if (enemy.state === ENEMY_STATES.DYING) {
    enemy.deathTimer = Math.max(0, enemy.deathTimer - dt);
    enemy.moving = false;
    if (enemy.deathTimer <= 0) finalizeEnemyDeath(enemy);
    return;
  }
  updateBossPhase(enemy);
  const dist = distance(enemy, state.player);
  if (enemy.state === ENEMY_STATES.HURT) {
    enemy.moving = false;
    if (enemy.stateTimer <= 0) setEnemyState(enemy, ENEMY_STATES.CHASE, 0);
    return;
  }
  if (enemy.state === ENEMY_STATES.PATROL) {
    enemy.moving = true;
    moveEnemyToward(enemy, { x: clamp(enemy.x + Math.sin(elapsed + enemy.level) * 24, 100, 860), y: enemy.y + 12 }, dt, .38);
    if (enemy.stateTimer <= 0 || dist < 330) setEnemyState(enemy, ENEMY_STATES.CHASE, 0);
    return;
  }
  if (enemy.state === ENEMY_STATES.TELEGRAPH) {
    enemy.moving = false;
    faceEnemyToward(enemy, enemy.lockedTarget || state.player);
    if (enemy.stateTimer <= 0) startEnemyAttack(enemy);
    return;
  }
  if (enemy.state === ENEMY_STATES.ATTACK) {
    updateEnemyAttack(enemy, dt);
    return;
  }
  if (enemy.state === ENEMY_STATES.RECOVER) {
    enemy.moving = false;
    if (enemy.stateTimer <= 0) setEnemyState(enemy, ENEMY_STATES.CHASE, 0);
    return;
  }
  updateEnemyChase(enemy, dist, dt);
}

function setEnemyState(enemy, nextState, duration = 0) {
  enemy.state = nextState;
  enemy.stateTimer = duration;
  enemy.stateDuration = duration;
}

function updateBossPhase(enemy) {
  if (!enemy.spec.boss || enemy.phaseChanged || enemy.hp / enemy.maxHp > enemy.spec.ai.phaseTwoThreshold) return;
  enemy.phase = 2;
  enemy.phaseChanged = true;
  enemy.speed *= enemy.spec.ai.phaseTwoSpeedMultiplier;
  burst(enemy.x, enemy.y - 30, "#d44f3f", 26);
  addFloater(enemy.x, enemy.y - 105, "FASE 2", "#ffd06b");
  showToast(`${enemy.name} entra em fúria!`, true);
  playTone(65, .12, .3, "sawtooth");
  updateUI();
}

function updateEnemyChase(enemy, dist, dt) {
  const ai = enemy.spec.ai;
  enemy.moving = false;
  if (enemy.spec.archetype === "archer") {
    if (dist < ai.retreatDistance) {
      moveEnemyAway(enemy, state.player, dt);
      return;
    }
    if (dist > ai.preferredDistance + 45 || !hasClearCaveLine(enemy, state.player)) {
      moveEnemyToward(enemy, state.player, dt);
      return;
    }
    startEnemyTelegraph(enemy);
    return;
  }
  const canUseCharge = (enemy.spec.archetype === "elite" || enemy.spec.boss) && dist < 330 && dist > ai.attackRange * 1.35;
  if (canUseCharge && enemy.attackKind !== "charge") {
    enemy.forcedPattern = "charge";
    startEnemyTelegraph(enemy);
  } else if (dist <= ai.attackRange) startEnemyTelegraph(enemy);
  else moveEnemyToward(enemy, state.player, dt);
}

function chooseEnemyPattern(enemy) {
  if (enemy.forcedPattern) {
    const forced = enemy.forcedPattern;
    enemy.forcedPattern = null;
    return forced;
  }
  const patterns = enemy.spec.ai.patterns || [enemy.spec.ai.pattern];
  const available = enemy.phase === 2 && enemy.spec.boss ? [...patterns, "area"] : patterns;
  const pattern = available[enemy.patternIndex % available.length];
  enemy.patternIndex += 1;
  return pattern;
}

function startEnemyTelegraph(enemy) {
  enemy.attackKind = chooseEnemyPattern(enemy);
  enemy.lockedTarget = { x: state.player.x, y: state.player.y };
  const dx = enemy.lockedTarget.x - enemy.x;
  const dy = enemy.lockedTarget.y - enemy.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  enemy.chargeDir = { x: dx / length, y: dy / length };
  const phaseSpeed = enemy.phase === 2 ? .76 : 1;
  const patternFactor = enemy.attackKind === "heavy" ? 1.2 : enemy.attackKind === "area" ? 1.32 : 1;
  setEnemyState(enemy, ENEMY_STATES.TELEGRAPH, enemy.spec.ai.telegraph * phaseSpeed * patternFactor);
}

function startEnemyAttack(enemy) {
  enemy.hitApplied = false;
  enemy.attackAnimation = enemy.spec.ai.attackDuration;
  setEnemyState(enemy, ENEMY_STATES.ATTACK, enemy.spec.ai.attackDuration);
  if (enemy.attackKind === "arrow" || enemy.attackKind === "ash_bolt") spawnEnemyProjectile(enemy);
  playTone(enemy.spec.boss ? 74 : 92, .055, .08, "square");
}

function updateEnemyAttack(enemy, dt) {
  const duration = Math.max(.01, enemy.stateDuration);
  const progress = clamp(1 - enemy.stateTimer / duration, 0, 1);
  enemy.attackAnimation = enemy.stateTimer;
  enemy.moving = enemy.attackKind === "charge";
  if (enemy.attackKind === "charge" && progress < .82) {
    const speed = enemy.spec.ai.chargeSpeed || 250;
    moveEnemyWithSliding(enemy, enemy.chargeDir.x * speed * dt, enemy.chargeDir.y * speed * dt);
  }
  if (!enemy.hitApplied && progress >= .42) {
    enemy.hitApplied = true;
    resolveEnemyAttack(enemy);
  }
  if (enemy.stateTimer <= 0) {
    enemy.attackAnimation = 0;
    const recovery = enemy.spec.ai.recovery * (enemy.phase === 2 ? .72 : 1);
    setEnemyState(enemy, ENEMY_STATES.RECOVER, recovery);
  }
}

function resolveEnemyAttack(enemy) {
  if (enemy.attackKind === "arrow" || enemy.attackKind === "ash_bolt") return;
  const phaseDamage = enemy.phase === 2 ? enemy.spec.ai.phaseTwoDamageMultiplier || 1 : 1;
  const damageMultiplier = enemy.attackKind === "heavy" ? 1.35 : enemy.attackKind === "area" ? 1.15 : enemy.attackKind === "charge" ? 1.22 : 1;
  const range = enemy.attackKind === "area" ? enemy.spec.ai.areaRadius : enemy.attackKind === "charge" ? 52 : enemy.spec.ai.attackRange + 10;
  const playerDx = state.player.x - enemy.x;
  const playerDy = state.player.y - enemy.y;
  const playerDistance = Math.max(1, Math.hypot(playerDx, playerDy));
  const locked = enemy.chargeDir || { x: enemy.facing, y: 0 };
  const directionalHit = enemy.attackKind === "area" || enemy.attackKind === "charge"
    || (playerDx / playerDistance) * locked.x + (playerDy / playerDistance) * locked.y > .15;
  if (directionalHit && playerDistance <= range + (enemy.spec.boss ? 16 : 0)) takeDamage(enemy.attack * phaseDamage * damageMultiplier);
}

function spawnEnemyProjectile(enemy) {
  const target = enemy.lockedTarget || state.player;
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const speed = enemy.phase === 2 ? 295 : 255;
  addOwnedProjectile(projectiles, {
    id: `${enemy.id}_${enemy.attackKind}_${elapsed}_${enemy.patternIndex}`, ownerId: enemy.id, kind: enemy.attackKind,
    x: enemy.x, y: enemy.y - 30, vx: dx / length * speed, vy: dy / length * speed,
    damage: enemy.attack, life: 2.2
  }, currentRegionConfig().farm?.projectileCap || 12);
}

function updateProjectiles(dt) {
  for (let index = projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = projectiles[index];
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
    if (projectile.life <= 0 || isCaveBlocked(projectile.x, projectile.y, 4)) {
      projectiles.splice(index, 1);
      continue;
    }
    if (Math.hypot(projectile.x - state.player.x, projectile.y - (state.player.y - 25)) < 20) {
      takeDamage(projectile.damage);
      projectiles.splice(index, 1);
    }
  }
}

function faceEnemyToward(enemy, target) {
  const dx = target.x - enemy.x;
  if (Math.abs(dx) > 1) enemy.facing = dx >= 0 ? 1 : -1;
}

function moveEnemyToward(enemy, destination, dt, speedMultiplier = 1) {
  enemy.navTimer -= dt;
  const directRoute = hasClearCaveLine(enemy, destination);
  if (!directRoute && (enemy.navTimer <= 0 || !enemy.navPath.length) && pathfindBudget > 0) {
    pathfindBudget -= 1;
    enemy.navPath = findCavePath(enemy, destination);
    const [minimum, maximum] = currentRegionConfig().farm?.navigationRepath || [.42, .68];
    enemy.navTimer = randomBetween(minimum, maximum);
  }
  let target = destination;
  if (!directRoute && enemy.navPath.length) {
    target = enemy.navPath[0];
    if (distance(enemy, target) < 12) {
      enemy.navPath.shift();
      target = enemy.navPath[0] || destination;
    }
  } else if (directRoute) enemy.navPath.length = 0;
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  faceEnemyToward(enemy, target);
  enemy.moving = true;
  moveEnemyWithSliding(enemy, dx / length * enemy.speed * speedMultiplier * dt, dy / length * enemy.speed * speedMultiplier * dt);
}

function moveEnemyAway(enemy, target, dt) {
  const dx = enemy.x - target.x;
  const dy = enemy.y - target.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  enemy.moving = true;
  enemy.facing = dx >= 0 ? -1 : 1;
  moveEnemyWithSliding(enemy, dx / length * enemy.speed * dt, dy / length * enemy.speed * dt);
}

function isVillageBlocked(x, y, radius = 15) {
  return villageTrees.some(([treeX, treeY, scale]) => Math.hypot(x - treeX, y - treeY) < radius + scale * 16)
    || villageRocks.some(([rockX, rockY, rockRadius]) => Math.hypot(x - rockX, y - rockY) < radius + rockRadius)
    || Math.hypot(x - merchant.x, y - merchant.y) < radius + 15
    || Math.hypot(x - forgeStation.x, y - forgeStation.y) < radius + 22;
}

function isCaveBlocked(x, y, radius = 15) {
  if (x < 73 + radius || x > 887 - radius || y < 112 + radius || y > 500 - radius) return true;
  const obstacles = state.world.currentRegionId === "bosque_cinzas" ? groveObstacles : caveRocks;
  return obstacles.some(([obstacleX, obstacleY, obstacleRadius]) => Math.hypot(x - obstacleX, y - obstacleY) < radius + obstacleRadius);
}

function moveEnemyWithSliding(enemy, dx, dy) {
  const radius = enemy.spec?.boss ? 22 : enemy.spec?.archetype === "elite" ? 17 : 14;
  const nextX = clamp(enemy.x + dx, 74, 886);
  const nextY = clamp(enemy.y + dy, 113, 496);
  if (!isCaveBlocked(nextX, nextY, radius)) {
    enemy.x = nextX;
    enemy.y = nextY;
    return;
  }
  let moved = false;
  if (!isCaveBlocked(nextX, enemy.y, radius)) { enemy.x = nextX; moved = true; }
  if (!isCaveBlocked(enemy.x, nextY, radius)) { enemy.y = nextY; moved = true; }
  if (!moved) enemy.navTimer = 0;
}

function separateEnemies() {
  const farm = currentRegionConfig().farm || {};
  const minimumDistance = farm.separationRadius || 30;
  const strength = farm.separationStrength || .45;
  const living = encounter.enemies.filter(enemy => enemy.state !== ENEMY_STATES.DYING);
  for (let left = 0; left < living.length; left += 1) {
    for (let right = left + 1; right < living.length; right += 1) {
      const first = living[left];
      const second = living[right];
      let dx = second.x - first.x;
      let dy = second.y - first.y;
      let gap = Math.hypot(dx, dy);
      if (gap >= minimumDistance) continue;
      if (gap < .01) { dx = left % 2 ? 1 : -1; dy = .5; gap = Math.hypot(dx, dy); }
      const push = (minimumDistance - gap) * strength * .5;
      const pushX = dx / gap * push;
      const pushY = dy / gap * push;
      moveEnemyWithSliding(first, -pushX, -pushY);
      moveEnemyWithSliding(second, pushX, pushY);
    }
  }
}

function hasClearCaveLine(from, to) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.ceil(length / 14);
  for (let i = 1; i < steps; i += 1) {
    const ratio = i / steps;
    const x = from.x + (to.x - from.x) * ratio;
    const y = from.y + (to.y - from.y) * ratio;
    if (isCaveBlocked(x, y, 14)) return false;
  }
  return true;
}

function findCavePath(from, to) {
  const size = 28;
  const toCell = point => ({ x: Math.round(point.x / size), y: Math.round(point.y / size) });
  const nearestWalkableCell = (origin, targetPoint) => {
    if (!isCaveBlocked(origin.x * size, origin.y * size, 15)) return origin;
    let best = null;
    for (let radius = 1; radius <= 3; radius += 1) {
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
          const cell = { x: origin.x + offsetX, y: origin.y + offsetY };
          const worldX = cell.x * size;
          const worldY = cell.y * size;
          if (isCaveBlocked(worldX, worldY, 15)) continue;
          const score = Math.hypot(worldX - targetPoint.x, worldY - targetPoint.y);
          if (!best || score < best.score) best = { ...cell, score };
        }
      }
      if (best) return { x: best.x, y: best.y };
    }
    return origin;
  };
  const start = nearestWalkableCell(toCell(from), from);
  const goal = nearestWalkableCell(toCell(to), to);
  const key = node => `${node.x},${node.y}`;
  const heuristic = node => Math.hypot(goal.x - node.x, goal.y - node.y);
  const open = [{ ...start, g: 0, f: heuristic(start) }];
  const cameFrom = new Map();
  const costs = new Map([[key(start), 0]]);
  const closed = new Set();
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    const currentKey = key(current);
    if (closed.has(currentKey)) continue;
    if (current.x === goal.x && current.y === goal.y) {
      const path = [];
      let cursor = currentKey;
      while (cameFrom.has(cursor)) {
        const [cellX, cellY] = cursor.split(",").map(Number);
        path.unshift({ x: cellX * size, y: cellY * size });
        cursor = cameFrom.get(cursor);
      }
      return path;
    }
    closed.add(currentKey);

    for (const [offsetX, offsetY] of directions) {
      const neighbor = { x: current.x + offsetX, y: current.y + offsetY };
      const neighborKey = key(neighbor);
      const worldX = neighbor.x * size;
      const worldY = neighbor.y * size;
      if (closed.has(neighborKey) || isCaveBlocked(worldX, worldY, 15)) continue;
      if (offsetX && offsetY) {
        if (isCaveBlocked((current.x + offsetX) * size, current.y * size, 15)
          || isCaveBlocked(current.x * size, (current.y + offsetY) * size, 15)) continue;
      }
      const nextCost = current.g + (offsetX && offsetY ? 1.414 : 1);
      if (nextCost >= (costs.get(neighborKey) ?? Infinity)) continue;
      costs.set(neighborKey, nextCost);
      cameFrom.set(neighborKey, currentKey);
      open.push({ ...neighbor, g: nextCost, f: nextCost + heuristic(neighbor) });
    }
  }
  return [];
}

function updateInteractionPrompt() {
  let text = "";
  if (state.world.scene === "village") {
    if (distance(state.player, merchant) < 70) text = "Falar com Bram, o mercador";
    else if (distance(state.player, forgeStation) < 78) text = "Usar a forja de Bram";
    else if (distance(state.player, caveEntrance) < 82) text = "Consultar o mapa de regiões";
  } else if (distance(state.player, { x: 480, y: 485 }) < 75) text = `Sair de ${currentRegionDefinition().name}`;
  ui["interaction-prompt"].hidden = !text;
  if (text) ui["interaction-text"].textContent = text;
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    particles.push({ x, y, vx: randomBetween(-65, 65), vy: randomBetween(-80, 10), life: randomBetween(.3, .65), maxLife: .65, color, size: randomBetween(2, 5) });
  }
}

function addFloater(x, y, text, color) { floaters.push({ x, y, text, color, life: 1.05 }); }

function updateParticles(dt) {
  particles.forEach(particle => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 130 * dt;
    particle.life -= dt;
  });
  floaters.forEach(floater => { floater.y -= 28 * dt; floater.life -= dt; });
  for (let i = particles.length - 1; i >= 0; i -= 1) if (particles[i].life <= 0) particles.splice(i, 1);
  for (let i = floaters.length - 1; i >= 0; i -= 1) if (floaters[i].life <= 0) floaters.splice(i, 1);
}

function render() {
  if (state.world.scene === "village") drawVillage();
  else if (state.world.currentRegionId === "bosque_cinzas") drawAshenGrove();
  else drawCave();
  drawActors();
  drawEffects();
  if (transitionFlash > 0) {
    ctx.fillStyle = `rgba(10, 8, 6, ${transitionFlash * .75})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (ui["forge-dialog"].open) drawForgePreview();
}

function drawVillage() {
  ctx.fillStyle = "#527a3f";
  ctx.fillRect(0, 0, W, H);
  drawTileGround("village");
  drawCaveMouth();
  villageRocks.forEach(([x, y, radius]) => drawRock(x, y, radius, "#566052"));
  villageTrees.forEach(([x, y, scale]) => drawTree(x, y, scale));
  drawMarketPatch();
  drawForgeStation();

  ctx.fillStyle = "#f6e7a8";
  ctx.font = "700 12px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("BRAM • MERCADOR", merchant.x, merchant.y - 78);
  ctx.fillText("FORJA DE BRAM", forgeStation.x, forgeStation.y - 78);
  ctx.fillText("CAVERNA SOMBRIA", 790, 72);
}

function drawTileGround(scene) {
  for (let row = 0; row < Math.ceil(H / TILE); row += 1) {
    for (let column = 0; column < W / TILE; column += 1) {
      const x = column * TILE;
      const y = row * TILE;
      if (scene === "village") {
        const pathCenter = 480 + (500 - (y + 16)) * .97;
        const path = y > 150 && Math.abs(x + 16 - pathCenter) < 58;
        ctx.fillStyle = path ? ((row + column) % 2 ? "#ad9564" : "#a38b5d") : ((row + column) % 2 ? "#527a3f" : "#567f42");
        ctx.fillRect(x, y, TILE, TILE);
        if (path) {
          ctx.fillStyle = "#796944";
          ctx.fillRect(x + ((row * 7 + column * 3) % 20), y + ((column * 9) % 22), 4, 3);
        } else if ((row * 5 + column * 3) % 4 === 0) {
          ctx.fillStyle = "#385f35";
          ctx.fillRect(x + 8, y + 19, 3, 7);
          ctx.fillRect(x + 13, y + 16, 3, 10);
        }
      } else {
        ctx.fillStyle = (row + column) % 2 ? "#3a3a32" : "#35362f";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "#292b27";
        if ((row * 7 + column * 5) % 3 === 0) ctx.fillRect(x + 7, y + 22, 11, 3);
      }
    }
  }

  if (scene === "village") {
    ctx.fillStyle = "#325c60";
    ctx.fillRect(0, 330, 128, 96);
    ctx.fillRect(0, 314, 96, 128);
    ctx.fillStyle = "#5b8981";
    for (let y = 326; y < 430; y += 20) {
      ctx.fillRect(12 + (y % 40), y, 42, 3);
      ctx.fillRect(72, y + 8, 35, 3);
    }
    ctx.fillStyle = "#d7c77a";
    ctx.fillRect(20, 388, 22, 4);
    ctx.fillRect(31, 378, 4, 22);
  }
}

function drawMarketPatch() {
  ctx.fillStyle = "#80533b";
  ctx.fillRect(139, 305, 112, 54);
  ctx.fillStyle = "#a9794d";
  for (let x = 143; x < 246; x += 16) ctx.fillRect(x, 309, 8, 46);
  ctx.fillStyle = "#6d4931";
  ctx.fillRect(122, 318, 18, 22);
  ctx.fillRect(252, 319, 20, 20);
  ctx.fillStyle = "#d4a950";
  ctx.fillRect(126, 322, 10, 5);
  ctx.fillStyle = "#a4493e";
  ctx.fillRect(257, 323, 10, 6);
}

function drawForgeStation() {
  const x = forgeStation.x;
  const y = forgeStation.y;
  const flicker = Math.round(Math.sin(elapsed * 13) * 2);
  ctx.fillStyle = "#3a3027"; ctx.fillRect(x - 54, y - 54, 108, 59);
  ctx.fillStyle = "#57483a"; ctx.fillRect(x - 50, y - 50, 100, 50);
  ctx.fillStyle = "#211b18"; ctx.fillRect(x + 17, y - 44, 27, 39);
  ctx.fillStyle = "#ba4d2e"; ctx.fillRect(x + 21, y - 30 - flicker, 19, 25 + flicker);
  ctx.fillStyle = "#f2a63f"; ctx.fillRect(x + 26, y - 23 - flicker, 9, 18 + flicker);
  ctx.fillStyle = "#242826"; ctx.fillRect(x - 42, y - 27, 45, 13);
  ctx.fillRect(x - 32, y - 39, 27, 13);
  ctx.fillStyle = "#858d89"; ctx.fillRect(x - 38, y - 34, 31, 6);
  ctx.fillStyle = "#34302a"; ctx.fillRect(x - 27, y - 14, 14, 20);
  ctx.fillStyle = "#72513a"; ctx.fillRect(x - 52, y + 2, 102, 9);
  ctx.fillStyle = "#a16a3e"; ctx.fillRect(x - 48, y + 4, 95, 3);
}

function drawForgePreview() {
  const preview = ui["forge-preview"];
  const forgeCtx = preview.getContext("2d");
  forgeCtx.imageSmoothingEnabled = false;
  forgeCtx.clearRect(0, 0, preview.width, preview.height);
  forgeCtx.fillStyle = "#10130f"; forgeCtx.fillRect(0, 0, preview.width, preview.height);
  forgeCtx.fillStyle = "#24251f";
  for (let row = 0; row < 5; row += 1) for (let column = 0; column < 8; column += 1) {
    forgeCtx.fillRect(column * 30 + (row % 2 ? -15 : 0), row * 24, 27, 20);
  }
  const glow = .58 + Math.sin(elapsed * 10) * .12;
  forgeCtx.globalAlpha = glow;
  forgeCtx.fillStyle = "#9f3f25"; forgeCtx.fillRect(168, 55, 38, 59);
  forgeCtx.fillStyle = "#ef8734"; forgeCtx.fillRect(176, 68, 22, 46); forgeCtx.fillRect(182, 55, 11, 18);
  forgeCtx.fillStyle = "#ffd568"; forgeCtx.fillRect(183, 79, 9, 35);
  forgeCtx.globalAlpha = 1;
  forgeCtx.fillStyle = "#242827"; forgeCtx.fillRect(53, 94, 95, 19); forgeCtx.fillRect(71, 78, 58, 18);
  forgeCtx.fillStyle = "#89908c"; forgeCtx.fillRect(60, 82, 76, 8); forgeCtx.fillRect(50, 92, 102, 7);
  forgeCtx.fillStyle = "#312d29"; forgeCtx.fillRect(83, 112, 36, 30);
  if (selectedForgeUid) forgeCtx.drawImage(forgeIcon, 82, 40, 58, 58);
  if (forgeEffectTimer > 0) {
    const progress = 1 - forgeEffectTimer / .85;
    const hammerY = 17 + Math.abs(Math.sin(progress * Math.PI * 4)) * 23;
    forgeCtx.save(); forgeCtx.translate(68, hammerY); forgeCtx.rotate(-.62);
    forgeCtx.fillStyle = "#795139"; forgeCtx.fillRect(0, -3, 47, 7);
    forgeCtx.fillStyle = "#aeb4b0"; forgeCtx.fillRect(38, -13, 26, 24); forgeCtx.restore();
    for (let index = 0; index < 14; index += 1) {
      const angle = index * .91 + elapsed * 2;
      const radius = 18 + progress * (20 + index * 2);
      forgeCtx.globalAlpha = 1 - progress;
      forgeCtx.fillStyle = index % 2 ? "#ffd568" : "#ef8734";
      forgeCtx.fillRect(111 + Math.cos(angle) * radius, 83 + Math.sin(angle) * radius * .55, 4, 4);
    }
    forgeCtx.globalAlpha = 1;
  }
}

function drawCaveMouth() {
  ctx.fillStyle = "#29332b";
  ctx.fillRect(704, 91, 176, 104);
  ctx.fillStyle = "#465044";
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const offset = row % 2 ? 12 : 0;
      ctx.fillRect(707 + column * 29 + offset, 94 + row * 28, 25, 24);
      ctx.fillStyle = "#586253";
      ctx.fillRect(710 + column * 29 + offset, 97 + row * 28, 18, 4);
      ctx.fillStyle = "#465044";
    }
  }
  ctx.fillStyle = "#080b09";
  ctx.fillRect(750, 131, 80, 64);
  ctx.fillRect(762, 115, 56, 20);
  ctx.fillRect(774, 107, 32, 12);
  ctx.fillStyle = "#0f1712";
  ctx.fillRect(759, 164, 62, 31);
  drawTorch(724, 165); drawTorch(856, 165);
}

function drawTree(x, y, scale = 1) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale, scale);
  ctx.fillStyle = "#483a28";
  ctx.fillRect(-7, -10, 14, 42);
  ctx.fillStyle = "#1f462b";
  ctx.fillRect(-27, -48, 54, 42);
  ctx.fillRect(-19, -60, 38, 14);
  ctx.fillStyle = "#2f6135";
  ctx.fillRect(-23, -44, 18, 15);
  ctx.fillRect(4, -52, 18, 18);
  ctx.fillStyle = "#477b42";
  ctx.fillRect(-17, -55, 17, 10);
  ctx.fillRect(3, -42, 14, 9);
  ctx.fillStyle = "#153820";
  ctx.fillRect(-28, -19, 56, 12);
  ctx.restore();
}

function drawCave() {
  ctx.fillStyle = "#35362f";
  ctx.fillRect(0, 0, W, H);
  drawTileGround("cave");
  drawCaveWalls();
  caveRocks.forEach(([x, y, radius]) => drawRock(x, y, radius, "#494a40"));
  drawTorch(95, 245); drawTorch(865, 245);
  drawCaveExit();

  if (farmRuntime && !encounter.enemies.length && (farmRuntime.spawnTimer > 0 || farmRuntime.breakTimer > 0)) {
    ctx.fillStyle = `rgba(175, 57, 43, ${.2 + Math.sin(elapsed * 7) * .08})`;
    ctx.beginPath(); ctx.ellipse(480, 270, 85, 25, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawAshenGrove() {
  ctx.fillStyle = "#292923";
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += TILE) {
    for (let x = 0; x < W; x += TILE) {
      const alternate = ((x / TILE + y / TILE) % 2) === 0;
      ctx.fillStyle = alternate ? "#303129" : "#34332a";
      ctx.fillRect(x, y, TILE, TILE);
      if ((x * 3 + y * 5) % 128 === 0) {
        ctx.fillStyle = "#7f4932";
        ctx.fillRect(x + 7, y + 18, 4, 3);
      }
    }
  }

  ctx.fillStyle = "#151712";
  ctx.fillRect(0, 0, W, 105);
  ctx.fillRect(0, 105, 70, H - 105);
  ctx.fillRect(890, 105, 70, H - 105);
  for (let x = 12; x < W; x += 54) drawBurntTree(x, 104, .85 + (x % 3) * .08);
  for (let y = 145; y < H; y += 82) {
    drawBurntTree(43, y, .82);
    drawBurntTree(918, y + 25, .92);
  }
  groveObstacles.forEach(([x, y, radius], index) => drawAshObstacle(x, y, radius, index));
  drawGroveExit();

  ctx.globalAlpha = .45;
  for (let index = 0; index < 18; index += 1) {
    const x = (index * 137 + elapsed * (5 + index % 4)) % W;
    const y = 110 + ((index * 71 - elapsed * (13 + index % 3) + 5000) % 370);
    ctx.fillStyle = index % 3 ? "#8e5639" : "#da7643";
    ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
  }
  ctx.globalAlpha = 1;

  if (farmRuntime && !encounter.enemies.length && (farmRuntime.spawnTimer > 0 || farmRuntime.breakTimer > 0)) {
    ctx.fillStyle = `rgba(205, 91, 52, ${.18 + Math.sin(elapsed * 7) * .07})`;
    ctx.fillRect(405, 255, 150, 22);
    ctx.fillRect(427, 246, 106, 40);
  }
}

function drawBurntTree(x, y, scale = 1) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale, scale);
  ctx.fillStyle = "#171714";
  ctx.fillRect(-9, -44, 18, 70);
  ctx.fillRect(-31, -37, 24, 9);
  ctx.fillRect(7, -24, 29, 8);
  ctx.fillRect(-24, -58, 8, 26);
  ctx.fillRect(24, -43, 7, 24);
  ctx.fillStyle = "#5d4030";
  ctx.fillRect(-5, -38, 6, 55);
  ctx.fillStyle = "#ad5d39";
  ctx.fillRect(-5, 5, 5, 8);
  ctx.restore();
}

function drawAshObstacle(x, y, radius, index) {
  const size = Math.max(16, Math.round(radius * .85));
  ctx.fillStyle = "#12141088";
  ctx.fillRect(x - size, y + 6, size * 2 + 8, 10);
  if (index % 2) {
    ctx.fillStyle = "#30251e";
    ctx.fillRect(x - size, y - 8, size * 2, 15);
    ctx.fillStyle = "#63412e";
    ctx.fillRect(x - size + 4, y - 5, size * 2 - 9, 4);
    ctx.fillStyle = "#c36b3d";
    ctx.fillRect(x + size - 5, y - 6, 4, 8);
  } else {
    ctx.fillStyle = "#24231e";
    ctx.fillRect(x - size * .65, y - size, size * 1.3, size + 10);
    ctx.fillStyle = "#55402f";
    ctx.fillRect(x - size * .45, y - size + 5, size * .9, 5);
  }
}

function drawGroveExit() {
  ctx.fillStyle = "#151813";
  ctx.fillRect(419, 472, 122, 68);
  ctx.fillStyle = "#33271f";
  ctx.fillRect(429, 464, 10, 76);
  ctx.fillRect(521, 464, 10, 76);
  ctx.fillStyle = "#6c4931";
  ctx.fillRect(438, 485, 84, 5);
  ctx.fillRect(448, 499, 64, 4);
}

function drawCaveWalls() {
  ctx.fillStyle = "#171b18";
  ctx.fillRect(0, 0, W, 108);
  ctx.fillRect(0, 108, 72, H - 108);
  ctx.fillRect(888, 108, 72, H - 108);
  ctx.fillStyle = "#252b26";
  for (let x = 0; x < W; x += 32) {
    ctx.fillRect(x, 82 + (x / 32 % 2) * 7, 29, 24);
    ctx.fillStyle = "#343a33";
    ctx.fillRect(x + 3, 85 + (x / 32 % 2) * 7, 20, 4);
    ctx.fillStyle = "#252b26";
  }
  for (let y = 112; y < H; y += 31) {
    ctx.fillRect(8, y, 54, 27);
    ctx.fillRect(898, y + 9, 54, 27);
    ctx.fillStyle = "#343a33";
    ctx.fillRect(12, y + 4, 31, 4);
    ctx.fillRect(902, y + 13, 31, 4);
    ctx.fillStyle = "#252b26";
  }
}

function drawCaveExit() {
  ctx.fillStyle = "#514e3f";
  ctx.fillRect(416, 480, 128, 60);
  ctx.fillRect(430, 462, 100, 26);
  ctx.fillStyle = "#8c8058";
  ctx.fillRect(425, 480, 8, 60);
  ctx.fillRect(527, 480, 8, 60);
  ctx.fillStyle = "#090b09";
  ctx.fillRect(440, 480, 80, 60);
  ctx.fillStyle = "#d7bd6b";
  ctx.fillRect(448, 487, 64, 4);
}

function drawRock(x, y, radius, color) {
  const size = Math.max(12, Math.round(radius / 4) * 4);
  ctx.fillStyle = "#15171488";
  ctx.fillRect(Math.round(x - size), Math.round(y + size * .45), size * 2 + 6, Math.max(5, size * .45));
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - size), Math.round(y - size * .35), size * 2, Math.round(size * .9));
  ctx.fillRect(Math.round(x - size * .65), Math.round(y - size * .72), Math.round(size * 1.3), Math.round(size * .45));
  ctx.fillStyle = "#737a6a";
  ctx.fillRect(Math.round(x - size * .5), Math.round(y - size * .58), Math.round(size * .72), Math.max(3, Math.round(size * .18)));
}

function drawTorch(x, y) {
  const flicker = Math.floor(Math.sin(elapsed * 12 + x) * 3);
  ctx.fillStyle = "#65482f";
  ctx.fillRect(x - 3, y, 6, 35);
  ctx.fillStyle = "#9b6738";
  ctx.fillRect(x - 6, y - 2, 12, 5);
  ctx.fillStyle = "#dc6932";
  ctx.fillRect(x - 7, y - 15 - flicker, 14, 16 + flicker);
  ctx.fillRect(x - 3, y - 22 - flicker, 7, 9);
  ctx.fillStyle = "#ffd66c";
  ctx.fillRect(x - 3, y - 12 - flicker, 7, 11);
}

function drawActors() {
  const actors = [{ type: "player", y: state.player.y }];
  encounter.enemies.forEach(enemy => actors.push({ type: "enemy", y: enemy.y, enemy }));
  if (state.world.scene === "village") actors.push({ type: "merchant", y: merchant.y });
  actors.sort((a, b) => a.y - b.y);
  actors.forEach(actor => {
    if (actor.type === "player") drawPlayer();
    else if (actor.type === "enemy") drawEnemy(actor.enemy);
    else drawMerchantNPC();
  });
}

function drawPlayer() {
  const p = state.player;
  const activeSkill = skillRuntime.active;
  ctx.save();
  if (invulnerableTimer > 0 && Math.floor(invulnerableTimer * 18) % 2) ctx.globalAlpha = .42;
  drawPixelShadow(p.x, p.y, 19);
  const gear = getPlayerEquipmentVisuals();
  drawPixelHero(p.x, p.y, directionFromVector(p.dirX, p.dirY), moving, attackTimer > 0, activeSkill ? { ...gear, weapon: null } : gear);
  if (attackTimer > 0) drawSlash(p.x, p.y, p.dirX, p.dirY, 1 - attackTimer / PLAYER_ATTACK_DURATION);
  if (activeSkill) drawPlayerSkillAnimation(activeSkill, gear.weapon?.visual);
  ctx.restore();
}

function drawPlayerSkillAnimation(active, weaponVisual) {
  const definition = SKILLS[active.id];
  const total = skillDuration(definition);
  const progress = clamp(active.elapsed / total, 0, 1);
  const facingAngle = Math.atan2(active.direction.y, active.direction.x);
  ctx.save();
  ctx.translate(Math.round(state.player.x), Math.round(state.player.y - 27));
  if (active.id === "golpe_poderoso") {
    const anticipationEnd = definition.phases.anticipation / total;
    const activeEnd = (definition.phases.anticipation + definition.phases.active) / total;
    let angle;
    if (progress < anticipationEnd) angle = facingAngle - 1.55 - progress / anticipationEnd * .32;
    else if (progress < activeEnd) angle = facingAngle - 1.87 + (progress - anticipationEnd) / (activeEnd - anticipationEnd) * 2.45;
    else angle = facingAngle + .58 - (progress - activeEnd) / (1 - activeEnd) * .42;
    drawWorldSword(angle, weaponVisual, 8, active.phase === "active");
    if (active.phase === "active") {
      ctx.globalAlpha = .45; ctx.fillStyle = "#f1d480"; ctx.rotate(facingAngle);
      ctx.fillRect(24, -18, definition.effects.range - 22, 5); ctx.fillRect(36, 10, definition.effects.range - 40, 4);
    }
  } else if (active.id === "corte_giratorio") {
    const activeStart = definition.phases.anticipation / total;
    const spinProgress = clamp((progress - activeStart) / (definition.phases.active / total), 0, 1);
    const rotation = facingAngle - .7 + spinProgress * Math.PI * 2;
    for (let index = 3; index >= 0; index -= 1) {
      ctx.globalAlpha = active.phase === "active" ? .25 + (3 - index) * .16 : index ? .12 : 1;
      drawWorldSword(rotation - index * .3, weaponVisual, 18, index === 0);
    }
    ctx.globalAlpha = .42;
    ctx.strokeStyle = "#e8c86b"; ctx.lineWidth = 5; ctx.beginPath();
    ctx.arc(0, 18, definition.effects.radius * .72, rotation - 1.45, rotation + .25); ctx.stroke();
  } else if (active.id === "investida") {
    drawWorldSword(facingAngle, weaponVisual, 16, active.phase === "active");
    ctx.rotate(facingAngle);
    ctx.fillStyle = "#87aaa366";
    const trail = active.phase === "active" ? 52 : 25;
    ctx.fillRect(-trail, -17, trail - 5, 4); ctx.fillRect(-trail - 8, 3, trail, 4); ctx.fillRect(-trail + 9, 21, trail - 14, 3);
    ctx.fillStyle = "#263c3a88"; ctx.fillRect(-28, -25, 22, 42);
  }
  ctx.restore();
}

function drawWorldSword(angle, visual, reach = 10, impact = false) {
  ctx.save(); ctx.rotate(angle);
  ctx.fillStyle = "#6b452a"; ctx.fillRect(reach - 8, -4, 17, 8);
  ctx.fillStyle = visual?.style === "rusty" ? "#a87c42" : "#d2b259"; ctx.fillRect(reach + 7, -9, 6, 18);
  const length = visual?.style === "short" ? 31 : visual?.style === "iron" ? 48 : 40;
  ctx.fillStyle = visual?.metal || "#d8dfdf"; ctx.fillRect(reach + 13, -5, length, 10); ctx.fillRect(reach + 13 + length, -2, 7, 4);
  ctx.fillStyle = impact ? "#fff1ad" : "#8b9695"; ctx.fillRect(reach + 18, 2, length - 5, 3);
  if (impact) { ctx.fillStyle = "#fff3b0aa"; ctx.fillRect(reach + length + 8, -8, 13, 16); }
  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.save();
  drawEnemyTelegraph(enemy);
  if (enemy.hurtTimer > 0 && Math.floor(enemy.hurtTimer * 34) % 2) ctx.globalAlpha = .46;
  let deathProgress = 0;
  if (enemy.state === ENEMY_STATES.DYING) {
    deathProgress = clamp(1 - enemy.deathTimer / enemy.deathDuration, 0, 1);
    ctx.globalAlpha *= 1 - deathProgress * .82;
    ctx.translate(0, deathProgress * 22);
    ctx.rotate((enemy.facing || 1) * deathProgress * .38);
  }
  drawPixelShadow(enemy.x, enemy.y, enemy.spec.boss ? 31 : 18);
  const target = enemy.lockedTarget || state.player;
  const direction = directionFromVector(target.x - enemy.x, target.y - enemy.y);
  if (enemy.spec.visual.species) drawForestEnemy(enemy, direction);
  else drawPixelGoblin(enemy, direction);
  ctx.restore();
}

function drawForestEnemy(enemy, direction) {
  const species = enemy.spec.visual.species;
  if (species === "raven") drawCarrionRaven(enemy, direction);
  else if (species === "wolf") drawAshWolf(enemy, direction);
  else if (species === "cultist") drawAshCultist(enemy, direction);
  else if (species === "ent") drawAshEnt(enemy, direction);
  else drawRottenStag(enemy, direction);
}

function drawCarrionRaven(enemy, direction) {
  const { visual } = enemy.spec;
  const motion = forestEnemyMotion(enemy);
  const facing = direction === "left" ? -1 : direction === "right" ? 1 : enemy.facing || 1;
  const flap = enemy.moving || motion.attacking ? (Math.floor(elapsed * 12) % 4 < 2 ? -7 : 2) : -1;
  ctx.save();
  ctx.translate(Math.round(enemy.x + facing * motion.lunge), Math.round(enemy.y - 12));
  ctx.scale(facing * visual.scale, visual.scale);
  ctx.fillStyle = "#1d1c20"; ctx.fillRect(-18, -24, 31, 23); ctx.fillRect(8, -31, 19, 17);
  ctx.fillStyle = visual.skin; ctx.fillRect(-14, -28, 27, 21); ctx.fillRect(-5, -36 + flap, 8, 27);
  ctx.fillStyle = "#302b31"; ctx.fillRect(-18, -31 + flap, 15, 7); ctx.fillRect(-12, -23 + flap, 13, 6);
  ctx.fillStyle = visual.accent; ctx.fillRect(19, -26, 5, 4);
  ctx.fillStyle = "#a86a3e"; ctx.fillRect(25, -23, 13, 5); ctx.fillRect(34, -19, 7, 3);
  ctx.fillStyle = "#2a2527"; ctx.fillRect(-23, -14, 12, 5); ctx.fillRect(-27, -9, 12, 4);
  ctx.fillStyle = "#7c5940"; ctx.fillRect(-9, -8, 4, 9); ctx.fillRect(5, -8, 4, 9);
  ctx.restore();
}

function forestEnemyMotion(enemy) {
  const attacking = enemy.state === ENEMY_STATES.ATTACK;
  const step = enemy.moving ? (Math.floor(elapsed * 11) % 4 < 2 ? -2 : 2) : 0;
  const attackProgress = attacking ? 1 - enemy.stateTimer / Math.max(.01, enemy.stateDuration) : 0;
  return { attacking, step, attackProgress, lunge: attacking ? Math.sin(attackProgress * Math.PI) * 10 : 0 };
}

function drawAshWolf(enemy, direction) {
  const { visual } = enemy.spec;
  const motion = forestEnemyMotion(enemy);
  const facing = direction === "left" ? -1 : direction === "right" ? 1 : enemy.facing || 1;
  ctx.save();
  ctx.translate(Math.round(enemy.x + facing * motion.lunge), Math.round(enemy.y));
  ctx.scale(facing * visual.scale, visual.scale);
  ctx.fillStyle = "#241f1c"; ctx.fillRect(-22, -14, 39, 22);
  ctx.fillStyle = visual.skin; ctx.fillRect(-19, -27, 38, 23); ctx.fillRect(12, -35, 24, 22);
  ctx.fillRect(-29, -24, 13, 8);
  ctx.fillStyle = visual.armor; ctx.fillRect(-9, -31, 19, 24);
  ctx.fillStyle = "#2d2824";
  ctx.fillRect(-15, -5 + motion.step, 8, 12); ctx.fillRect(8, -5 - motion.step, 8, 12);
  ctx.fillStyle = visual.skin;
  ctx.fillRect(15, -43, 8, 11); ctx.fillRect(28, -43, 7, 11);
  ctx.fillStyle = visual.accent; ctx.fillRect(25, -29, 5, 4);
  ctx.fillStyle = "#171512"; ctx.fillRect(31, -24, 8, 5);
  ctx.fillStyle = "#eee0bd"; ctx.fillRect(33, -19, 4, 6); ctx.fillRect(27, -19, 3, 5);
  ctx.restore();
}

function drawAshCultist(enemy, direction) {
  const { visual } = enemy.spec;
  const motion = forestEnemyMotion(enemy);
  const facing = direction === "left" ? -1 : direction === "right" ? 1 : enemy.facing || 1;
  ctx.save();
  ctx.translate(Math.round(enemy.x), Math.round(enemy.y + Math.abs(motion.step) - 1));
  ctx.scale(facing * visual.scale, visual.scale);
  ctx.fillStyle = "#221d1d"; ctx.fillRect(-15, -37, 30, 34); ctx.fillRect(-19, -24, 7, 23);
  ctx.fillStyle = visual.armor; ctx.fillRect(-12, -34, 24, 28);
  ctx.fillStyle = "#171516"; ctx.fillRect(-14, -57, 28, 23); ctx.fillRect(-10, -63, 20, 10);
  ctx.fillStyle = visual.skin; ctx.fillRect(-8, -50, 16, 12);
  ctx.fillStyle = visual.accent; ctx.fillRect(1, -47, 4, 3);
  const staffAngle = enemy.attackKind === "ash_bolt" && motion.attacking ? -.35 : -.7;
  ctx.save(); ctx.translate(13, -28); ctx.rotate(staffAngle);
  ctx.fillStyle = "#68452e"; ctx.fillRect(-3, -28, 6, 55);
  ctx.fillStyle = visual.accent; ctx.fillRect(-8, -36, 16, 12); ctx.fillRect(-3, -43, 6, 8);
  ctx.fillStyle = "#ffca6a"; ctx.fillRect(-3, -33, 6, 6);
  ctx.restore();
  ctx.fillStyle = "#3b302a"; ctx.fillRect(-12, -8 + motion.step, 9, 9); ctx.fillRect(3, -8 - motion.step, 9, 9);
  ctx.restore();
}

function drawAshEnt(enemy, direction) {
  const { visual } = enemy.spec;
  const motion = forestEnemyMotion(enemy);
  const facing = direction === "left" ? -1 : 1;
  ctx.save();
  ctx.translate(Math.round(enemy.x + facing * motion.lunge * .4), Math.round(enemy.y));
  ctx.scale(facing * visual.scale, visual.scale);
  ctx.fillStyle = "#2b251f"; ctx.fillRect(-17, -47, 34, 43);
  ctx.fillStyle = visual.skin; ctx.fillRect(-13, -52, 26, 48); ctx.fillRect(-10, -65, 21, 19);
  ctx.fillStyle = visual.armor; ctx.fillRect(-10, -43, 20, 10); ctx.fillRect(-8, -23, 16, 8);
  ctx.fillStyle = visual.accent; ctx.fillRect(-4, -49, 5, 18); ctx.fillRect(2, -27, 4, 14);
  ctx.fillStyle = "#e79a59"; ctx.fillRect(-7, -58, 4, 4); ctx.fillRect(5, -58, 4, 4);
  const armLift = enemy.state === ENEMY_STATES.TELEGRAPH ? -18 : motion.attacking ? -8 : 0;
  ctx.fillStyle = visual.skin;
  ctx.fillRect(-29, -40 + armLift, 17, 9); ctx.fillRect(12, -40 + armLift, 25, 9);
  ctx.fillRect(-33, -47 + armLift, 7, 18); ctx.fillRect(32, -48 + armLift, 7, 19);
  ctx.fillRect(-14, -8 + motion.step, 10, 10); ctx.fillRect(5, -8 - motion.step, 10, 10);
  ctx.restore();
}

function drawRottenStag(enemy, direction) {
  const { visual } = enemy.spec;
  const motion = forestEnemyMotion(enemy);
  const facing = direction === "left" ? -1 : direction === "right" ? 1 : enemy.facing || 1;
  ctx.save();
  ctx.translate(Math.round(enemy.x + facing * motion.lunge), Math.round(enemy.y));
  ctx.scale(facing * visual.scale, visual.scale);
  ctx.fillStyle = "#29221e"; ctx.fillRect(-25, -38, 47, 32);
  ctx.fillStyle = visual.skin; ctx.fillRect(-22, -45, 44, 34); ctx.fillRect(13, -58, 23, 28);
  ctx.fillStyle = visual.armor; ctx.fillRect(-12, -48, 24, 38);
  ctx.fillStyle = "#352c25"; ctx.fillRect(-19, -12 + motion.step, 9, 13); ctx.fillRect(10, -12 - motion.step, 9, 13);
  ctx.fillRect(-16, -2 + motion.step, 8, 6); ctx.fillRect(12, -2 - motion.step, 8, 6);
  ctx.fillStyle = visual.accent; ctx.fillRect(25, -49, 5, 4); ctx.fillRect(-6, -39, 5, 19);
  ctx.fillStyle = "#e9d3a2";
  ctx.fillRect(17, -74, 4, 18); ctx.fillRect(29, -76, 4, 20);
  ctx.fillRect(8, -78, 13, 4); ctx.fillRect(30, -82, 13, 4);
  ctx.fillRect(9, -86, 4, 10); ctx.fillRect(39, -90, 4, 10);
  ctx.fillStyle = "#1b1715"; ctx.fillRect(34, -43, 7, 5);
  if (enemy.phase === 2) { ctx.fillStyle = "#e9673e"; ctx.fillRect(25, -49, 6, 5); ctx.fillRect(-5, -35, 4, 15); }
  ctx.restore();
}

function drawEnemyTelegraph(enemy) {
  if (enemy.state !== ENEMY_STATES.TELEGRAPH) return;
  const progress = 1 - enemy.stateTimer / Math.max(.01, enemy.stateDuration);
  const pulse = .42 + Math.sin(progress * Math.PI * 8) * .16;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = progress > .68 ? "#ffe08a" : "#d95445";
  ctx.fillStyle = "#b43d302b";
  ctx.lineWidth = enemy.spec.boss ? 5 : 3;
  ctx.setLineDash([9, 7]);
  if (enemy.attackKind === "area") {
    const radius = enemy.spec.ai.areaRadius;
    ctx.beginPath(); ctx.arc(enemy.x, enemy.y - 16, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (enemy.attackKind === "charge" || enemy.attackKind === "arrow" || enemy.attackKind === "ash_bolt") {
    const target = enemy.lockedTarget || state.player;
    ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y - 25); ctx.lineTo(target.x, target.y - 25); ctx.stroke();
    ctx.fillRect(target.x - 7, target.y - 32, 14, 14);
  } else {
    const range = enemy.spec.ai.attackRange + (enemy.attackKind === "heavy" ? 22 : 8);
    const target = enemy.lockedTarget || state.player;
    const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    ctx.save(); ctx.translate(enemy.x, enemy.y - 18); ctx.rotate(angle);
    ctx.beginPath(); ctx.arc(0, 0, range, -.26 * Math.PI, .26 * Math.PI); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawMerchantNPC() {
  drawPixelShadow(merchant.x, merchant.y, 17);
  const bob = Math.floor(Math.sin(elapsed * 2.5) * 1.5);
  ctx.save();
  ctx.translate(Math.round(merchant.x), Math.round(merchant.y + bob));
  ctx.fillStyle = "#251b18"; ctx.fillRect(-18, -50, 36, 45);
  ctx.fillStyle = "#8b5637"; ctx.fillRect(-15, -45, 30, 39);
  ctx.fillStyle = "#b77a49"; ctx.fillRect(-12, -40, 24, 8);
  ctx.fillStyle = "#e1b878"; ctx.fillRect(-12, -62, 24, 19);
  ctx.fillStyle = "#5f3528"; ctx.fillRect(-15, -66, 30, 10); ctx.fillRect(-12, -57, 5, 10);
  ctx.fillStyle = "#302523"; ctx.fillRect(-9, -48, 18, 7);
  ctx.fillStyle = "#f1d28a"; ctx.fillRect(-6, -56, 4, 3); ctx.fillRect(4, -56, 4, 3);
  ctx.fillStyle = "#3a2b20"; ctx.fillRect(-14, -7, 11, 7); ctx.fillRect(3, -7, 11, 7);
  ctx.fillStyle = "#d7aa4d"; ctx.fillRect(17, -37, 7, 13); ctx.fillRect(20, -32, 8, 5);
  ctx.restore();
}

function directionFromVector(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

function drawPixelShadow(x, y, radius) {
  ctx.fillStyle = "#11150f66";
  ctx.fillRect(Math.round(x - radius), Math.round(y - 5), radius * 2, 8);
  ctx.fillRect(Math.round(x - radius + 5), Math.round(y - 8), radius * 2 - 10, 14);
}

function getPlayerEquipmentVisuals() {
  return Object.fromEntries(Object.keys(EQUIPMENT_SLOTS).map(slot => {
    const entry = getEquippedEntry(state.player, slot);
    return [slot, entry ? ITEMS[entry.definitionId] : null];
  }));
}

function drawPixelHero(x, y, direction, isMoving, isAttacking, gear) {
  const step = isMoving ? (Math.floor(elapsed * 9) % 4 < 2 ? -2 : 2) : 0;
  const bob = isMoving ? Math.abs(step) - 1 : 0;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + bob));

  if (direction === "up") drawPixelWeapon(direction, isAttacking, false, gear.weapon?.visual);

  ctx.fillStyle = "#17273c";
  if (direction === "up") ctx.fillRect(-16, -42, 32, 32);
  else ctx.fillRect(-15, -31, 30, 22);

  ctx.fillStyle = "#2a2524";
  if (direction === "left" || direction === "right") {
    ctx.fillRect(-9, -8 + step, 8, 9);
    ctx.fillRect(2, -8 - step, 8, 9);
  } else {
    ctx.fillRect(-11, -9 + step, 8, 10);
    ctx.fillRect(3, -9 - step, 8, 10);
  }
  ctx.fillStyle = "#744832";
  ctx.fillRect(-12, -3 + step, 10, 5);
  ctx.fillRect(2, -3 - step, 10, 5);
  drawEquippedBoots(direction, step, gear.boots?.visual);

  const chestVisual = gear.chest?.visual;
  ctx.fillStyle = chestVisual?.primary || "#282b2d"; ctx.fillRect(-15, -34, 30, 26);
  ctx.fillStyle = chestVisual?.accent || "#8d9698"; ctx.fillRect(-12, -32, 24, 18);
  if (chestVisual?.style === "leather") {
    ctx.fillStyle = "#573824"; ctx.fillRect(-2, -32, 4, 18); ctx.fillRect(-11, -23, 22, 4);
    ctx.fillStyle = "#d2a069"; ctx.fillRect(-8, -30, 4, 4); ctx.fillRect(5, -21, 4, 4);
  } else if (chestVisual?.style === "bark") {
    ctx.fillStyle = "#392d25"; ctx.fillRect(-10, -31, 5, 21); ctx.fillRect(3, -30, 7, 22);
    ctx.fillStyle = chestVisual.accent || "#8d7752"; ctx.fillRect(-6, -28, 4, 12); ctx.fillRect(7, -23, 4, 8);
  } else {
    ctx.fillStyle = "#c3cbca"; ctx.fillRect(-8, -30, 16, 5);
    ctx.fillStyle = "#445158"; ctx.fillRect(-11, -20, 22, 5);
  }
  ctx.fillStyle = "#724934"; ctx.fillRect(-14, -15, 28, 6);
  ctx.fillStyle = "#d1a963"; ctx.fillRect(-2, -15, 5, 6);

  ctx.fillStyle = "#dea87a"; ctx.fillRect(-11, -51, 22, 18);
  ctx.fillStyle = "#432d25"; ctx.fillRect(-14, -57, 27, 11);
  ctx.fillRect(-13, -49, 5, 10);
  if (direction !== "up") {
    ctx.fillStyle = "#272322";
    if (direction === "left") ctx.fillRect(-7, -44, 4, 4);
    else if (direction === "right") ctx.fillRect(4, -44, 4, 4);
    else { ctx.fillRect(-7, -44, 4, 4); ctx.fillRect(4, -44, 4, 4); }
  }
  drawEquippedHelmet(direction, gear.helmet?.visual);

  ctx.fillStyle = "#667276";
  ctx.fillRect(-19, -32, 6, 16); ctx.fillRect(13, -32, 6, 16);
  ctx.fillStyle = "#d4dcda";
  ctx.fillRect(-19, -30, 6, 5); ctx.fillRect(13, -30, 6, 5);
  if (direction !== "up") drawPixelWeapon(direction, isAttacking, false, gear.weapon?.visual);
  ctx.restore();
}

function drawEquippedBoots(direction, step, visual) {
  if (!visual) return;
  ctx.fillStyle = visual.primary || "#68422e";
  if (direction === "left" || direction === "right") {
    ctx.fillRect(-10, -9 + step, 9, 8); ctx.fillRect(2, -9 - step, 9, 8);
  } else {
    ctx.fillRect(-12, -10 + step, 10, 9); ctx.fillRect(2, -10 - step, 10, 9);
  }
  ctx.fillStyle = visual.accent || "#a56d45";
  ctx.fillRect(-11, -7 + step, 9, 3); ctx.fillRect(3, -7 - step, 9, 3);
}

function drawEquippedHelmet(direction, visual) {
  if (!visual) return;
  const primary = visual.primary || "#98a5a5";
  const accent = visual.accent || "#d6dfdc";
  if (visual.style === "goblin_crown") {
    ctx.fillStyle = "#6e4e25"; ctx.fillRect(-14, -57, 28, 6);
    ctx.fillStyle = primary; ctx.fillRect(-13, -64, 6, 11); ctx.fillRect(-3, -68, 7, 15); ctx.fillRect(8, -63, 6, 10);
    ctx.fillStyle = accent; ctx.fillRect(-1, -65, 3, 3); ctx.fillRect(-11, -61, 3, 3); ctx.fillRect(10, -60, 3, 3);
    return;
  }
  if (visual.style === "antler_crown") {
    ctx.fillStyle = visual.accent || "#9f603b"; ctx.fillRect(-13, -57, 26, 6);
    ctx.fillStyle = primary; ctx.fillRect(-10, -70, 4, 15); ctx.fillRect(7, -72, 4, 17);
    ctx.fillRect(-18, -70, 10, 4); ctx.fillRect(9, -73, 11, 4);
    ctx.fillRect(-18, -77, 4, 10); ctx.fillRect(17, -80, 4, 10);
    return;
  }
  ctx.fillStyle = primary;
  ctx.fillRect(-13, -56, 26, 9); ctx.fillRect(-11, -61, 22, 7);
  ctx.fillStyle = accent; ctx.fillRect(-8, -59, 16, 3);
  if (direction === "left") { ctx.fillStyle = primary; ctx.fillRect(-13, -50, 6, 12); }
  else if (direction === "right") { ctx.fillStyle = primary; ctx.fillRect(7, -50, 6, 12); }
  else { ctx.fillStyle = primary; ctx.fillRect(-13, -50, 5, 11); ctx.fillRect(8, -50, 5, 11); }
}

function drawPixelGoblin(enemy, direction) {
  const { x, y, moving: isMoving, spec } = enemy;
  const visual = spec.visual;
  const isAttacking = enemy.state === ENEMY_STATES.ATTACK;
  const isTelegraphing = enemy.state === ENEMY_STATES.TELEGRAPH;
  const step = isMoving ? (Math.floor(elapsed * 10) % 4 < 2 ? -2 : 2) : 0;
  const idle = !isMoving && !isAttacking ? Math.round(Math.sin(elapsed * 3 + enemy.level) * 1) : 0;
  const bob = isMoving ? Math.abs(step) - 1 : idle;
  const attackProgress = isAttacking ? 1 - enemy.stateTimer / Math.max(.01, enemy.stateDuration) : 0;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + bob));
  ctx.scale(visual.scale, visual.scale);
  if (isTelegraphing) ctx.translate(-enemy.facing * 3, 3);
  if (isAttacking && enemy.attackKind !== "arrow") ctx.translate(enemy.facing * Math.sin(attackProgress * Math.PI) * 7, 0);
  if (direction === "up") drawGoblinWeapon(enemy, direction, isAttacking);
  ctx.fillStyle = "#3a2b25";
  ctx.fillRect(-11, -7 + step, 9, 8); ctx.fillRect(2, -7 - step, 9, 8);
  ctx.fillStyle = "#7d4c31";
  ctx.fillRect(-13, -2 + step, 11, 4); ctx.fillRect(2, -2 - step, 11, 4);
  if (spec.boss) { ctx.fillStyle = "#321719"; ctx.fillRect(-22, -39, 44, 34); ctx.fillRect(-27, -32, 8, 29); }
  ctx.fillStyle = "#4a2823"; ctx.fillRect(-15, -31, 30, 24);
  ctx.fillStyle = visual.armor; ctx.fillRect(-12, -27, 24, 15);
  if (["warrior", "elite", "boss"].includes(spec.archetype)) {
    ctx.fillStyle = visual.accent; ctx.fillRect(-15, -29, 7, 17); ctx.fillRect(8, -29, 7, 17);
    ctx.fillStyle = "#343638"; ctx.fillRect(-11, -25, 22, 5);
  }
  ctx.fillStyle = visual.skin; ctx.fillRect(-11, -49, 22, 20);
  ctx.fillRect(-20, -44, 9, 7); ctx.fillRect(11, -44, 9, 7);
  ctx.fillStyle = spec.boss ? "#aab957" : "#b6bd60"; ctx.fillRect(-8, -46, 16, 6);
  ctx.fillStyle = "#26301e";
  if (direction === "left") ctx.fillRect(-7, -41, 4, 4);
  else if (direction === "right") ctx.fillRect(4, -41, 4, 4);
  else if (direction !== "up") { ctx.fillRect(-7, -41, 4, 4); ctx.fillRect(4, -41, 4, 4); }
  ctx.fillStyle = visual.accent; ctx.fillRect(-5, -34, 4, 4); ctx.fillRect(3, -34, 4, 4);
  ctx.fillStyle = spec.archetype === "archer" ? "#68452a" : "#62696a";
  ctx.fillRect(-18, -30, 7, 15); ctx.fillRect(11, -30, 7, 15);
  if (spec.archetype === "elite") {
    ctx.fillStyle = "#292a28"; ctx.fillRect(-13, -55, 26, 8); ctx.fillRect(-17, -58, 6, 8); ctx.fillRect(11, -58, 6, 8);
    ctx.fillStyle = "#c25a47"; ctx.fillRect(-8, -55, 16, 3);
  }
  if (spec.boss) drawGoblinCrown();
  if (direction !== "up") drawGoblinWeapon(enemy, direction, isAttacking);
  ctx.restore();
}

function drawGoblinCrown() {
  ctx.fillStyle = "#6d4c21"; ctx.fillRect(-15, -58, 30, 7);
  ctx.fillStyle = "#e0b84f";
  ctx.fillRect(-14, -65, 7, 11); ctx.fillRect(-3, -69, 7, 15); ctx.fillRect(8, -64, 7, 10);
  ctx.fillStyle = "#ffe28a"; ctx.fillRect(-1, -66, 3, 3); ctx.fillRect(-12, -62, 3, 3); ctx.fillRect(10, -61, 3, 3);
}

function drawGoblinWeapon(enemy, direction, attacking) {
  if (enemy.spec.visual.weapon !== "bow") {
    const visual = {
      style: enemy.spec.visual.weapon,
      metal: enemy.spec.boss ? "#eef0d5" : enemy.spec.archetype === "elite" ? "#bcc2be" : "#a8aaa2",
      skin: enemy.spec.visual.skin
    };
    const preparing = enemy.state === ENEMY_STATES.TELEGRAPH;
    drawPixelWeapon(
      direction,
      attacking || preparing,
      true,
      visual,
      preparing ? enemy.stateDuration : enemy.attackAnimation,
      enemy.stateDuration
    );
    return;
  }
  const anchors = { right: [13, -25, 0], left: [-13, -25, Math.PI], down: [6, -18, Math.PI / 2], up: [-6, -31, -Math.PI / 2] };
  const [x, y, angle] = anchors[direction];
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.strokeStyle = "#b98246"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(15, 0, 17, -1.1, 1.1); ctx.stroke();
  ctx.strokeStyle = "#dfcf99"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(22, -15); ctx.lineTo(22, 15); ctx.stroke();
  if (enemy.state === ENEMY_STATES.TELEGRAPH || attacking) {
    ctx.fillStyle = "#9b8360"; ctx.fillRect(4, -2, 31, 4); ctx.fillRect(34, -1, 6, 2);
  }
  ctx.restore();
  ctx.fillStyle = enemy.spec.visual.skin; ctx.fillRect(x - 4, y - 4, 8, 8);
}

function weaponPose(direction, attacking, crude, forcedProgress = null, attackRemaining = null, attackDuration = null) {
  const anchors = {
    right: { x: 13, y: -23 }, left: { x: -13, y: -23 },
    down: { x: 7, y: -18 }, up: { x: -7, y: -29 }
  };
  const baseAngles = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  const duration = crude ? attackDuration || ENEMY_ATTACK_DURATION : PLAYER_ATTACK_DURATION;
  const remaining = crude ? attackRemaining || 0 : attackTimer;
  const progress = forcedProgress ?? clamp(1 - remaining / duration, 0, 1);
  const eased = smoothStep(progress);
  const restAngle = direction === "left" || direction === "up" ? -1.82 : -1.32;
  let angle = crude ? baseAngles[direction] + (direction === "left" || direction === "up" ? -.34 : .34) : restAngle;
  if (attacking) {
    if (crude) {
      angle = baseAngles[direction] - 1.08 + eased * 2.02;
    } else {
      // Antecipação, corte descendente e retorno compartilham a mesma empunhadura.
      // Isso mantém a espada presa à mão e deixa o golpe legível antes do acerto.
      const mirrored = direction === "left" || direction === "up";
      const startAngle = mirrored ? -1.66 : -1.48;
      const endAngle = mirrored ? -4.09 : .95;
      if (progress < .22) {
        angle = lerp(restAngle, startAngle, smoothStep(progress / .22));
      } else if (progress < .72) {
        angle = lerp(startAngle, endAngle, smoothStep((progress - .22) / .5));
      } else {
        angle = lerp(endAngle, restAngle, smoothStep((progress - .72) / .28));
      }
    }
  }
  const lift = !crude && attacking ? -Math.sin(progress * Math.PI) * 5 : 0;
  return { ...anchors[direction], y: anchors[direction].y + lift, angle, progress };
}

function smoothStep(value) {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function drawWeaponArm(direction, pose, crude, skin) {
  const shoulders = {
    right: { x: 14, y: -27 }, left: { x: -14, y: -27 },
    down: { x: 11, y: -26 }, up: { x: -11, y: -30 }
  };
  const shoulder = shoulders[direction];
  const handX = pose.x + Math.cos(pose.angle) * 3;
  const handY = pose.y + Math.sin(pose.angle) * 3;
  const dx = handX - shoulder.x;
  const dy = handY - shoulder.y;
  const length = Math.max(5, Math.hypot(dx, dy));
  ctx.save();
  ctx.translate(shoulder.x, shoulder.y);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = crude ? "#555f60" : "#667276";
  ctx.fillRect(0, -4, Math.max(4, length - 5), 8);
  ctx.fillStyle = crude ? "#747b78" : "#d4dcda";
  ctx.fillRect(0, -4, Math.min(6, length), 3);
  ctx.fillStyle = skin;
  ctx.fillRect(Math.max(0, length - 7), -3, 8, 7);
  ctx.restore();
}

function drawPixelWeapon(direction, attacking, crude, visual = null, attackRemaining = null, attackDuration = null) {
  const pose = weaponPose(direction, attacking, crude, null, attackRemaining, attackDuration);
  const skin = visual?.skin || (crude ? "#aeb65d" : "#dea87a");
  drawWeaponArm(direction, pose, crude, skin);
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle);
  ctx.fillStyle = skin;
  ctx.fillRect(-4, -4, 8, 8);
  ctx.fillStyle = "#553621";
  ctx.fillRect(-3, -3, 14, 6);
  const style = visual?.style || "default";
  const bladeLength = crude ? (style === "royal_blade" ? 31 : style === "greatsword" ? 27 : style === "sword" ? 23 : 20) : style === "short" ? 18 : style === "iron" || style === "ash" ? 27 : 23;
  const metal = crude ? visual?.metal || "#a8aaa2" : visual?.metal || "#d8dfdf";
  ctx.fillStyle = crude ? "#a68f45" : style === "rusty" ? "#a87c42" : "#d0b15b";
  ctx.fillRect(9, -7, 5, 14);
  if (!crude && style === "iron") { ctx.fillRect(7, -9, 3, 18); ctx.fillRect(13, -8, 3, 16); }
  ctx.fillStyle = metal;
  ctx.fillRect(14, -4, bladeLength, 8);
  ctx.fillRect(14 + bladeLength, -2, 5, 4);
  ctx.fillStyle = crude ? "#676b66" : style === "rusty" ? "#654d3b" : "#8d999a";
  ctx.fillRect(17, 2, Math.max(14, bladeLength - 3), 3);
  if (style === "iron") { ctx.fillStyle = "#f1f5ef"; ctx.fillRect(18, -2, bladeLength - 5, 2); }
  if (style === "rusty") { ctx.fillStyle = "#70452f"; ctx.fillRect(21, -4, 5, 3); ctx.fillRect(31, 1, 4, 2); }
  if (style === "ash") { ctx.fillStyle = "#d66f3e"; ctx.fillRect(19, 1, bladeLength - 4, 2); ctx.fillRect(30, -3, 5, 2); }
  ctx.restore();
}

function drawSlash(x, y, dx, dy, progress) {
  if (progress < .24 || progress > .78) return;
  const direction = directionFromVector(dx, dy);
  const pose = weaponPose(direction, true, false, progress);
  ctx.save();
  ctx.translate(Math.round(x + pose.x), Math.round(y + pose.y));
  for (let index = 0; index < 3; index += 1) {
    const trailProgress = clamp(progress - index * .07, 0, 1);
    const trailPose = weaponPose(direction, true, false, trailProgress);
    ctx.save();
    ctx.rotate(trailPose.angle);
    ctx.globalAlpha = .62 - index * .17;
    ctx.fillStyle = index ? "#d4a84f" : "#fff0a8";
    ctx.fillRect(34, -3, 8, 6);
    ctx.restore();
  }
  ctx.restore();
}

function drawEffects() {
  encounter.enemies.forEach(enemy => {
    if (enemy.state !== ENEMY_STATES.ATTACK || enemy.attackKind !== "area") return;
    const progress = 1 - enemy.stateTimer / Math.max(.01, enemy.stateDuration);
    const radius = enemy.spec.ai.areaRadius * clamp(progress * 1.35, 0, 1);
    ctx.save();
    ctx.globalAlpha = .65 * (1 - progress);
    ctx.strokeStyle = enemy.phase === 2 ? "#ff684d" : "#e5b95f";
    ctx.lineWidth = 10 - progress * 6;
    ctx.beginPath(); ctx.arc(enemy.x, enemy.y - 16, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });
  projectiles.forEach(projectile => {
    ctx.save();
    ctx.translate(Math.round(projectile.x), Math.round(projectile.y));
    ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
    if (projectile.kind === "ash_bolt") {
      ctx.fillStyle = "#5b2520"; ctx.fillRect(-14, -5, 20, 10);
      ctx.fillStyle = "#df7440"; ctx.fillRect(-8, -7, 17, 14); ctx.fillRect(8, -3, 7, 6);
      ctx.fillStyle = "#ffd079"; ctx.fillRect(-2, -3, 10, 5);
    } else {
      ctx.fillStyle = "#d7c697"; ctx.fillRect(-10, -1, 19, 3);
      ctx.fillStyle = "#9fa7a2"; ctx.fillRect(8, -3, 7, 7); ctx.fillRect(-13, -4, 5, 3); ctx.fillRect(-13, 2, 5, 3);
    }
    ctx.restore();
  });
  particles.forEach(particle => {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.font = "bold 13px ui-sans-serif, system-ui, sans-serif";
  floaters.forEach(floater => {
    ctx.globalAlpha = clamp(floater.life, 0, 1);
    ctx.fillStyle = "#000";
    ctx.fillText(floater.text, floater.x + 1, floater.y + 1);
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, floater.x, floater.y);
  });
  ctx.globalAlpha = 1;
}

function loop(now) {
  const dt = Math.min(.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

document.addEventListener("keydown", event => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"].includes(event.code)) event.preventDefault();
  if (event.code === "Space" && !event.repeat) playerAttack();
  else if ((event.code === "ShiftLeft" || event.code === "ShiftRight") && !event.repeat) playerDodge();
  else if (event.code === "KeyE" && !event.repeat) interact();
  else if (event.code === "KeyQ" && !event.repeat) usePotion();
  else if (event.code === "KeyI" && !event.repeat) toggleInventory();
  else if (event.code === "KeyK" && !event.repeat) ui["skills-dialog"].open ? closeSkills() : openSkills();
  else if (event.code === "KeyR" && !event.repeat && state.world.scene === "village") openRegions();
  else if (["Digit1", "Digit2", "Digit3"].includes(event.code) && !event.repeat) {
    const id = { Digit1: "golpe_poderoso", Digit2: "corte_giratorio", Digit3: "investida" }[event.code];
    activatePlayerSkill(id);
  }
  else if (event.code === "KeyM" && !event.repeat && state.world.scene === "village" && playing) openMerchant();
  else if (event.code === "KeyF" && !event.repeat && state.world.scene === "village" && playing) openForge();
  else keys.add(event.code);
});
document.addEventListener("keyup", event => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("beforeunload", () => saveGame());
window.addEventListener("error", event => {
  console.error("[KnightFall] Erro de execução.", event.error || event.message);
  if (playing) showToast("O jogo encontrou um erro. Consulte o console.", true);
});
window.addEventListener("unhandledrejection", event => {
  console.error("[KnightFall] Falha assíncrona não tratada.", event.reason);
  if (playing) showToast("O jogo encontrou um erro. Consulte o console.", true);
});

document.querySelectorAll("[data-control]").forEach(button => {
  const code = button.dataset.control;
  const press = event => { event.preventDefault(); keys.add(code); };
  const release = event => { event.preventDefault(); keys.delete(code); };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});
document.querySelectorAll("[data-action]").forEach(button => {
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (button.dataset.action === "attack") playerAttack();
    else if (button.dataset.action === "dodge") playerDodge();
    else if (button.dataset.action === "inventory") toggleInventory();
    else interact();
  });
});
document.querySelectorAll("[data-skill]").forEach(button => {
  drawSkillIcon(button.querySelector("canvas"), button.dataset.skill);
  button.addEventListener("pointerdown", event => { event.preventDefault(); activatePlayerSkill(button.dataset.skill); });
});
document.querySelectorAll("[data-buy]").forEach(button => button.addEventListener("click", () => buyItem(button.dataset.buy)));

ui["continue-button"].addEventListener("click", () => startGame(true));
ui["new-game-button"].addEventListener("click", () => startGame(false));
ui["potion-button"].addEventListener("click", usePotion);
ui["inventory-button"].addEventListener("click", openInventory);
ui["skills-button"].addEventListener("click", openSkills);
ui["skills-close-button"].addEventListener("click", closeSkills);
ui["region-button"].addEventListener("click", openRegions);
ui["region-close-button"].addEventListener("click", () => ui["region-dialog"].close());
ui["inventory-dialog"].addEventListener("close", hideItemTooltip);
ui["merchant-forge-button"].addEventListener("click", openForge);
ui["forge-close-button"].addEventListener("click", closeForge);
ui["forge-button"].addEventListener("click", reinforceSelectedEquipment);
ui["forge-sell-button"].addEventListener("click", sellSelectedEquipment);
ui["return-button"].addEventListener("click", returnToVillage);
ui["advance-floor-button"].addEventListener("click", advanceEncounter);
ui["leave-cave-button"].addEventListener("click", exitCave);
ui["sound-button"].addEventListener("click", () => {
  state.settings.audioEnabled = !state.settings.audioEnabled;
  ui["sound-button"].setAttribute("aria-pressed", String(state.settings.audioEnabled));
  ui["sound-button"].setAttribute("aria-label", state.settings.audioEnabled ? "Desativar sons" : "Ativar sons");
  ui["sound-button"].textContent = state.settings.audioEnabled ? "♪" : "♩";
  if (state.settings.audioEnabled) playTone(330, .04, .08, "triangle");
  saveGame();
});
ui["fullscreen-button"].addEventListener("click", () => {
  if (!document.fullscreenElement) ui.viewport.requestFullscreen?.();
  else document.exitFullscreen?.();
});
document.querySelector(".brand").addEventListener("click", () => {
  if (!playing) return;
  saveGame();
  playing = false;
  keys.clear();
  ui["start-screen"].classList.remove("hidden");
  ui["start-screen"].removeAttribute("aria-hidden");
  ui["start-screen"].inert = false;
  ui["continue-button"].hidden = false;
});

ui["continue-button"].hidden = !hasSave();
updateUI();
requestAnimationFrame(loop);

window.KnightFallDebug = {
  enterCave,
  enterRegion,
  exitCave,
  addCoins(amount = 100) { state.player.coins += Number(amount) || 0; updateUI(); },
  navigationPath(from, to) { return findCavePath(from, to); },
  enemy: () => primaryEnemy() ? structuredClone(primaryEnemy()) : null,
  encounter: () => structuredClone(encounter),
  setFloor(floor) {
    const progress = currentRegionProgress();
    const target = clamp(Math.floor(Number(floor) || 1), 1, currentRegionConfig().totalFloors);
    progress.highestUnlockedFloor = Math.max(progress.highestUnlockedFloor, target);
    progress.selectedFloor = target;
    if (state.world.scene === "cave") startFloorEncounter(.05);
    updateUI();
    return target;
  },
  unlockRegion(regionId) {
    const definition = GAME_CONFIG.regions[regionId];
    if (!definition || definition.status !== "playable") return false;
    if (definition.unlock?.bossId) {
      const sourceRegion = Object.entries(GAME_CONFIG.regions).find(([, entry]) => entry.bossId === definition.unlock.bossId)?.[0];
      if (sourceRegion) state.world.regionProgress[sourceRegion].bossVictories = Math.max(1, state.world.regionProgress[sourceRegion].bossVictories || 0);
    }
    updateUI(); saveGame(); return regionUnlockStatus(state.world, regionId).unlocked;
  },
  damageEnemy(amount = 1) {
    const target = primaryEnemy();
    if (!target || target.state === ENEMY_STATES.DYING) return null;
    target.hp = Math.max(0, target.hp - Math.max(0, Number(amount) || 0));
    if (target.hp <= 0) beginEnemyDeath(target);
    else updateBossPhase(target);
    updateUI();
    return target.hp;
  },
  healPlayer() { state.player.hp = calculateStats(state.player).maxHp; updateUI(); return state.player.hp; },
  defeatPlayer() { state.player.hp = 1; takeDamage(99999); },
  projectiles: () => structuredClone(projectiles),
  defeatEnemy() { const target = primaryEnemy(); if (target) { target.hp = 0; beginEnemyDeath(target); } },
  stats: () => calculateStats(state.player),
  dodge: playerDodge,
  combatTimers: () => ({ attackTimer, dodgeTimer, dodgeCooldownTimer, invulnerableTimer }),
  skillRuntime: () => structuredClone(skillRuntime),
  addSkillPoints(amount = 5) { state.player.skillProgression.points += Math.max(0, Math.floor(Number(amount) || 0)); updateUI(); return state.player.skillProgression.points; },
  setPlayerLevel(level) { state.player.level = Math.max(1, Math.floor(Number(level) || 1)); updateUI(); return state.player.level; },
  learnSkill(id) { const result = upgradeSkill(state.player, id); updateUI(); return result; },
  useSkill: activatePlayerSkill,
  approachEnemy(gap = 55) {
    const target = primaryEnemy(); if (!target) return false;
    state.player.x = target.x - Math.max(25, Number(gap) || 55); state.player.y = target.y;
    state.player.dirX = 1; state.player.dirY = 0; state.player.facing = 1; return true;
  },
  openInventory,
  openForge,
  addForgeResources(amount = 100) {
    state.player.coins += Number(amount) * 10 || 0;
    for (const definitionId of ["fragmento_ferro", "fragmento_aco", "essencia", "seiva_corrompida", "cinza_viva", "cristal_raro"]) addInventoryItem(state.player, definitionId, Number(amount) || 1);
    updateUI();
    if (ui["forge-dialog"].open) renderForgeUI();
  },
  reinforce(uid = selectedForgeUid) { const result = enhanceEquipment(state.player, uid, { transactionId: `debug_${Date.now()}_${Math.random()}` }); updateUI(); return result; },
  addItem(definitionId, quantity = 1) { const added = addInventoryItem(state.player, definitionId, quantity); updateUI(); return added; },
  equip(uid) { const result = equipItem(state.player, uid); updateUI(); return result; },
  state: () => structuredClone(state)
};
