import { BALANCE, WEAPON_TYPES, createWeaponMastery, playerExpRequired } from "./progression.js";
import { AREAS } from "./data.js";

const SAVE_KEY = "ecosDoAbismo.save";
const SAVE_VERSION = 7;

export function saveGame(gameState) {
  localStorage.setItem(SAVE_KEY, serializeGame(gameState));
}

function serializeGame(gameState) {
  return JSON.stringify({
    game: "KnightFall",
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state: gameState
  }, null, 2);
}

function parseSaveJson(json) {
  const payload = JSON.parse(json);
  if (!payload?.state?.player || payload.version > SAVE_VERSION) throw new Error("Arquivo de save inválido ou incompatível.");
  return migrateState(payload.state);
}

export function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return parseSaveJson(raw);
  } catch {
    return null;
  }
}

function migrateState(state) {
  const player = state.player;
  player.expToNext = playerExpRequired(player.level || 1);
  player.energy ??= 3;
  player.maxEnergy ??= 3;
  player.equipment ??= { weapon: null, armor: null, charm: null };
  player.equipment.helmet ??= null;
  player.equipment.boots ??= null;
  player.bag ??= { purchasedSlots: 0 };
  player.bag.purchasedSlots ??= 0;
  const masteryDefaults = createWeaponMastery();
  player.weaponMastery ??= masteryDefaults;
  for (const [type, defaults] of Object.entries(masteryDefaults)) {
    player.weaponMastery[type] ??= defaults;
    const mastery = player.weaponMastery[type];
    mastery.level = Math.max(1, Math.min(BALANCE.MASTERY_MAX_LEVEL, Number.isFinite(mastery.level) ? Math.floor(mastery.level) : 1));
    mastery.exp = Math.max(0, Number.isFinite(mastery.exp) ? mastery.exp : 0);
    mastery.totalTrainingTime = Math.max(0, Number.isFinite(mastery.totalTrainingTime) ? mastery.totalTrainingTime : 0);
  }
  player.skills ??= ["golpe_poderoso"];
  state.inventory ??= [];
  state.world ??= {};
  state.world.currentArea ??= "ruinas_despertar";
  state.world.explorationCount ??= 0;
  state.world.regionProgress ??= {};
  state.world.bossesDefeated ??= {};
  state.world.bossPity ??= {};
  state.settings ??= { musicEnabled: true };
  state.expedition ??= { active: false, steps: 0 };
  state.trainingSession ??= null;
  state.autoFarmSession ??= null;
  const farmDefaults = { autoPotion: true, potionThreshold: 0.4, preserveRarePotions: true, stopWhenFull: true, stopWithoutPotions: false };
  state.autoFarmSettings = { ...farmDefaults, ...(state.autoFarmSettings || {}) };
  if (state.trainingSession?.active) {
    const startedAt = Number(state.trainingSession.startedAt);
    if (!WEAPON_TYPES[state.trainingSession.weaponType] || !Number.isFinite(startedAt) || startedAt <= 0) state.trainingSession = null;
  }
  if (state.autoFarmSession?.active) {
    const startedAt = Number(state.autoFarmSession.startedAt);
    if (!AREAS[state.autoFarmSession.regionId] || !Number.isFinite(startedAt) || startedAt <= 0 || !isValidFarmSnapshot(state.autoFarmSession.playerSnapshot)) state.autoFarmSession = null;
  }
  if (state.trainingSession?.active && state.autoFarmSession?.active) state.autoFarmSession = null;
  if (state.combat) state.combat.visualActions ??= [];
  return state;
}

function isValidFarmSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const finiteFields = ["level", "hp", "maxHp", "attack", "defense", "crit", "attackInterval", "occupiedSlots", "bagCapacity"];
  if (finiteFields.some(field => !Number.isFinite(Number(snapshot[field])))) return false;
  return Number(snapshot.level) > 0 && Number(snapshot.maxHp) > 0 && Number(snapshot.attackInterval) > 0 && Number(snapshot.bagCapacity) > 0 && Boolean(WEAPON_TYPES[snapshot.weaponType]) && snapshot.attributes && typeof snapshot.attributes === "object";
}

export function deleteSave() { localStorage.removeItem(SAVE_KEY); }
export function hasSave() { return loadGame() !== null; }
