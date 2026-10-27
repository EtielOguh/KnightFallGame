import { AREAS, EQUIPMENT_SLOTS, GAME_CONFIG, ITEMS, SKILLS } from "./data.js";
import { createRegionProgressMap, getRegionConfig } from "./dungeon.js";
import { calculateStats, createPlayer, normalizePlayer } from "./player.js";
import { WEAPON_TYPES } from "./progression.js";

export const STATE_SCHEMA_VERSION = GAME_CONFIG.save.schemaVersion;

export function createInitialState(playerOptions = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    player: createPlayer(playerOptions),
    world: {
      scene: "village",
      caveVisits: 0,
      currentRegionId: "caverna_sombria",
      regionProgress: createRegionProgressMap(),
      currentArea: "ruinas_despertar",
      bossesDefeated: {},
      bossPity: {}
    },
    settings: { audioEnabled: true },
    systems: {
      trainingSession: null,
      autoFarmSession: null,
      autoFarmSettings: {
        autoPotion: true,
        potionThreshold: .4,
        preserveRarePotions: true,
        stopWhenFull: true,
        stopWithoutPotions: false
      }
    },
    flags: {},
    metadata: { createdAt: now, updatedAt: now }
  };
}

export function normalizeGameState(raw) {
  if (!raw || typeof raw !== "object" || !raw.player || typeof raw.player !== "object") {
    throw new TypeError("O save não contém um personagem válido.");
  }
  const defaults = createInitialState();
  const rawWorld = raw.world && typeof raw.world === "object" ? raw.world : {};
  const rawSettings = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  const rawSystems = raw.systems && typeof raw.systems === "object" ? raw.systems : {};
  const player = normalizePlayer({
    ...raw.player,
    inventory: raw.player.inventory ?? raw.inventory,
    progression: {
      ...(raw.player.progression || {}),
      kills: raw.player.progression?.kills ?? raw.kills ?? 0
    }
  });
  const legacyBossesDefeated = numberRecord(rawWorld.bossesDefeated);
  const regionProgress = createRegionProgressMap(rawWorld.regionProgress, rawWorld.caveProgress, player.progression.kills);
  for (const [regionId, definition] of Object.entries(GAME_CONFIG.regions)) {
    if (!definition.bossId || !regionProgress[regionId]) continue;
    regionProgress[regionId].bossVictories = Math.max(regionProgress[regionId].bossVictories, Math.floor(legacyBossesDefeated[definition.bossId] || 0));
    if (regionProgress[regionId].bossVictories > 0) {
      const bossFloor = getRegionConfig(regionId).totalFloors;
      regionProgress[regionId].floorObjectivesCompleted[bossFloor] = true;
      regionProgress[regionId].floorKills[bossFloor] = Math.max(regionProgress[regionId].floorKills[bossFloor] || 0, regionProgress[regionId].bossVictories);
    }
  }
  const state = {
    schemaVersion: STATE_SCHEMA_VERSION,
    player,
    world: {
      scene: normalizeScene(rawWorld.scene ?? raw.scene),
      caveVisits: integer(rawWorld.caveVisits, raw.caveVisits ?? 0, 0, 1000000000),
      currentRegionId: GAME_CONFIG.regions[rawWorld.currentRegionId]?.status === "playable" ? rawWorld.currentRegionId : "caverna_sombria",
      regionProgress,
      currentArea: AREAS[rawWorld.currentArea] ? rawWorld.currentArea : defaults.world.currentArea,
      // Campo legado neutralizado: bossVictories por região é a fonte canônica.
      bossesDefeated: {},
      bossPity: numberRecord(rawWorld.bossPity)
    },
    settings: {
      audioEnabled: boolean(rawSettings.audioEnabled, rawSettings.musicEnabled ?? raw.sound ?? true)
    },
    systems: {
      trainingSession: normalizeTrainingSession(rawSystems.trainingSession ?? raw.trainingSession),
      autoFarmSession: normalizeAutoFarmSession(rawSystems.autoFarmSession ?? raw.autoFarmSession),
      autoFarmSettings: {
        autoPotion: boolean((rawSystems.autoFarmSettings ?? raw.autoFarmSettings)?.autoPotion, defaults.systems.autoFarmSettings.autoPotion),
        potionThreshold: finite((rawSystems.autoFarmSettings ?? raw.autoFarmSettings)?.potionThreshold, defaults.systems.autoFarmSettings.potionThreshold, .1, .9),
        preserveRarePotions: boolean((rawSystems.autoFarmSettings ?? raw.autoFarmSettings)?.preserveRarePotions, defaults.systems.autoFarmSettings.preserveRarePotions),
        stopWhenFull: boolean((rawSystems.autoFarmSettings ?? raw.autoFarmSettings)?.stopWhenFull, defaults.systems.autoFarmSettings.stopWhenFull),
        stopWithoutPotions: boolean((rawSystems.autoFarmSettings ?? raw.autoFarmSettings)?.stopWithoutPotions, defaults.systems.autoFarmSettings.stopWithoutPotions)
      }
    },
    flags: plainObject(raw.flags) || {},
    metadata: {
      createdAt: validDate(raw.metadata?.createdAt) || validDate(raw.createdAt) || defaults.metadata.createdAt,
      updatedAt: validDate(raw.metadata?.updatedAt) || validDate(raw.savedAt) || defaults.metadata.updatedAt
    }
  };
  const stats = calculateStats(state.player);
  state.player.hp = finite(state.player.hp, stats.maxHp, 0, stats.maxHp);
  const validation = validateGameState(state);
  if (!validation.valid) throw new TypeError(`Estado migrado inválido: ${validation.errors.join("; ")}`);
  return state;
}

export function createSaveSnapshot(state) {
  const snapshot = normalizeGameState(state);
  const home = GAME_CONFIG.player.startPosition;
  snapshot.world.scene = "village";
  snapshot.player.x = home.x;
  snapshot.player.y = home.y;
  snapshot.player.dirX = home.dirX;
  snapshot.player.dirY = home.dirY;
  snapshot.player.facing = home.dirX >= 0 ? 1 : -1;
  snapshot.metadata.updatedAt = new Date().toISOString();
  return snapshot;
}

export function validateGameState(state) {
  const errors = [];
  if (!state || typeof state !== "object") return { valid: false, errors: ["estado ausente"] };
  if (state.schemaVersion !== STATE_SCHEMA_VERSION) errors.push("versão de estado incorreta");
  if (!state.player || typeof state.player !== "object") errors.push("personagem ausente");
  if (!state.world || typeof state.world !== "object") errors.push("mundo ausente");
  if (!state.settings || typeof state.settings !== "object") errors.push("configurações ausentes");
  if (state.player) {
    if (!state.player.id || !state.player.name) errors.push("identidade do personagem inválida");
    for (const field of ["level", "xp", "hp", "coins", "x", "y"]) {
      if (!Number.isFinite(Number(state.player[field]))) errors.push(`player.${field} não é numérico`);
    }
    if (!Array.isArray(state.player.inventory)) errors.push("inventário inválido");
    if (!state.player.equipment || typeof state.player.equipment !== "object") errors.push("equipamentos inválidos");
    if (Array.isArray(state.player.inventory)) {
      const seen = new Set();
      for (const entry of state.player.inventory) {
        if (!entry?.uid || seen.has(entry.uid) || !ITEMS[entry.definitionId]) errors.push("instância de item inválida");
        if (ITEMS[entry?.definitionId]?.type === "equipment"
          && (!Number.isInteger(entry.enhancementLevel) || entry.enhancementLevel < 0 || entry.enhancementLevel > GAME_CONFIG.forge.maxLevel)) errors.push("nível de reforço inválido");
        seen.add(entry?.uid);
      }
      if (state.player.inventory.length > Number(state.player.bag?.capacity)) errors.push("inventário excede a capacidade");
    }
    if (state.player.equipment && typeof state.player.equipment === "object") {
      for (const slot of Object.keys(EQUIPMENT_SLOTS)) {
        const uid = state.player.equipment[slot];
        const entry = uid ? state.player.inventory?.find(item => item.uid === uid) : null;
        if (uid && (!entry || ITEMS[entry.definitionId]?.slot !== slot)) errors.push(`equipamento inválido em ${slot}`);
      }
    }
    if (!state.player.skillProgression || !Number.isInteger(state.player.skillProgression.points) || state.player.skillProgression.points < 0) errors.push("progressão de habilidades inválida");
    else for (const [id, definition] of Object.entries(SKILLS)) {
      const level = state.player.skillProgression[definition.kind]?.[id]?.level;
      if (!Number.isInteger(level) || level < 0 || level > definition.maxLevel) errors.push(`nível inválido em ${id}`);
    }
    if (!state.player.resources || !Number.isFinite(state.player.resources.stamina)
      || state.player.resources.maxStamina !== GAME_CONFIG.skills.staminaMax
      || state.player.resources.stamina < 0 || state.player.resources.stamina > state.player.resources.maxStamina) errors.push("recursos do personagem inválidos");
    if (!state.player.attributes || !state.player.baseStats || !state.player.progression) errors.push("atributos ou progressão ausentes");
    const stats = calculateStats(state.player);
    if (state.player.hp < 0 || state.player.hp > stats.maxHp) errors.push("vida fora dos limites");
  }
  if (state.world && !["village", "cave"].includes(state.world.scene)) errors.push("cena inválida");
  if (state.world) {
    if (!GAME_CONFIG.regions[state.world.currentRegionId] || GAME_CONFIG.regions[state.world.currentRegionId].status !== "playable") errors.push("região atual inválida");
    for (const [regionId, progress] of Object.entries(state.world.regionProgress || {})) {
      let total = 0;
      try { total = getRegionConfig(regionId).totalFloors; } catch { errors.push(`região inválida em progresso: ${regionId}`); continue; }
      if (!progress || !Number.isInteger(progress.highestUnlockedFloor) || progress.highestUnlockedFloor < 1 || progress.highestUnlockedFloor > total) errors.push(`progresso inválido em ${regionId}`);
      if (!Number.isInteger(progress?.selectedFloor) || progress.selectedFloor < 1 || progress.selectedFloor > progress.highestUnlockedFloor) errors.push(`andar selecionado inválido em ${regionId}`);
      if (progress && (!progress.floorKills || !progress.floorObjectivesCompleted || !progress.floorCompletions || !progress.uniqueRewardsClaimed)) errors.push(`progresso ou recompensas inválidos em ${regionId}`);
      for (const [floor, kills] of Object.entries(progress?.floorKills || {})) {
        if (!Number.isInteger(Number(floor)) || Number(floor) < 1 || Number(floor) > total || !Number.isInteger(kills) || kills < 0) errors.push(`abates inválidos em ${regionId}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

function normalizeScene(value) {
  return value === "cave" ? "cave" : "village";
}

function normalizeTrainingSession(value) {
  if (!value || typeof value !== "object" || !value.active) return null;
  const startedAt = Number(value.startedAt);
  if (!WEAPON_TYPES[value.weaponType] || !Number.isFinite(startedAt) || startedAt <= 0) return null;
  const durationSeconds = Number(value.durationSeconds);
  return {
    active: true,
    weaponType: value.weaponType,
    startedAt,
    ...(Number.isFinite(durationSeconds) && durationSeconds > 0 ? { durationSeconds } : {})
  };
}

function normalizeAutoFarmSession(value) {
  if (!value || typeof value !== "object" || !value.active) return null;
  const startedAt = Number(value.startedAt);
  if (!AREAS[value.regionId] || !Number.isFinite(startedAt) || startedAt <= 0 || !plainObject(value.playerSnapshot)) return null;
  return { active: true, regionId: value.regionId, startedAt, playerSnapshot: value.playerSnapshot };
}

function numberRecord(value) {
  if (!plainObject(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, amount]) => {
    const number = Number(amount);
    return Number.isFinite(number) && number >= 0 ? [[key, number]] : [];
  }));
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function boolean(value, fallback) {
  return typeof value === "boolean" ? value : Boolean(fallback);
}

function finite(value, fallback, min = -Infinity, max = Infinity) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function integer(value, fallback, min = -Infinity, max = Infinity) {
  return Math.floor(finite(value, fallback, min, max));
}
