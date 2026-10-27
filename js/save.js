import { GAME_CONFIG } from "./data.js";
import { createSaveSnapshot, normalizeGameState, STATE_SCHEMA_VERSION, validateGameState } from "./state.js";

export const SAVE_KEY = GAME_CONFIG.save.primaryKey;
export const SAVE_VERSION = STATE_SCHEMA_VERSION;
export const LEGACY_SAVE_KEYS = Object.freeze([...GAME_CONFIG.save.legacyKeys]);

export function saveGame(gameState, options = {}) {
  const logger = options.logger || console;
  try {
    const storage = options.storage || getStorage();
    const snapshot = createSaveSnapshot(gameState);
    storage.setItem(SAVE_KEY, serializeGame(snapshot));
    return true;
  } catch (error) {
    logger.error("[KnightFall] Falha ao salvar a partida.", error);
    return false;
  }
}

export function loadGame(options = {}) {
  const logger = options.logger || console;
  let storage;
  try {
    storage = options.storage || getStorage();
  } catch (error) {
    logger.error("[KnightFall] Persistência local indisponível.", error);
    return null;
  }
  for (const key of [SAVE_KEY, ...LEGACY_SAVE_KEYS]) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      return decodeSave(raw, key);
    } catch (error) {
      logger.error(`[KnightFall] Save inválido ignorado em "${key}".`, error);
    }
  }
  return null;
}

export function hasSave(options = {}) {
  return loadGame(options) !== null;
}

export function deleteSave(options = {}) {
  const logger = options.logger || console;
  try {
    const storage = options.storage || getStorage();
    for (const key of [SAVE_KEY, ...LEGACY_SAVE_KEYS]) storage.removeItem(key);
    return true;
  } catch (error) {
    logger.error("[KnightFall] Falha ao apagar saves.", error);
    return false;
  }
}

export function serializeGame(gameState) {
  const validation = validateGameState(gameState);
  if (!validation.valid) throw new TypeError(`Estado recusado pelo save: ${validation.errors.join("; ")}`);
  return JSON.stringify({
    game: GAME_CONFIG.save.gameId,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state: gameState
  });
}

export function decodeSave(json, sourceKey = SAVE_KEY) {
  const payload = JSON.parse(json);
  if (!payload || typeof payload !== "object") throw new TypeError("Conteúdo do save inválido.");

  if (sourceKey === SAVE_KEY) {
    if (payload.game !== GAME_CONFIG.save.gameId || !payload.state) throw new TypeError("Envelope do save inválido.");
    if (!Number.isInteger(payload.version) || payload.version < 1) throw new TypeError("Versão do save ausente.");
    if (payload.version > SAVE_VERSION) throw new RangeError("Este save foi criado por uma versão mais nova do jogo.");
    return migrateVersionedState(payload.state, payload.version);
  }

  // knightfall.visual.v1 era um objeto de estado sem envelope.
  if (sourceKey === "knightfall.visual.v1") {
    if (!payload.player) throw new TypeError("Save visual v1 sem personagem.");
    return migrateVisualV1(payload);
  }

  // ecosDoAbismo.save usava envelope próprio e chegou à versão 7.
  if (sourceKey === "ecosDoAbismo.save") {
    if (!payload.state?.player) throw new TypeError("Save legado sem personagem.");
    return migrateLegacyTerminal(payload.state);
  }

  throw new TypeError("Origem de save desconhecida.");
}

function migrateVersionedState(state, version) {
  let migrated = state;
  if (version === 1) return migrateVisualV1(migrated);
  if (version < 6) {
    const legacyWorld = migrated.world && typeof migrated.world === "object" ? migrated.world : {};
    migrated = {
      ...migrated,
      world: {
        ...legacyWorld,
        currentRegionId: legacyWorld.currentRegionId || "caverna_sombria",
        regionProgress: legacyWorld.regionProgress && legacyWorld.regionProgress.caverna_sombria
          ? legacyWorld.regionProgress
          : {
              caverna_sombria: legacyWorld.caveProgress || {},
              bosque_cinzas: {}
            }
      }
    };
  }
  return normalizeGameState(migrated);
}

function migrateVisualV1(state) {
  return normalizeGameState({
    ...state,
    world: {
      scene: state.scene,
      caveVisits: state.caveVisits,
      currentArea: "ruinas_despertar",
      regionProgress: {},
      bossesDefeated: {},
      bossPity: {}
    },
    settings: { audioEnabled: state.sound }
  });
}

function migrateLegacyTerminal(state) {
  return normalizeGameState({
    ...state,
    player: { ...state.player, inventory: state.inventory },
    world: { ...state.world, scene: "village", caveVisits: 0 },
    settings: { audioEnabled: state.settings?.musicEnabled ?? true },
    systems: {
      trainingSession: state.trainingSession,
      autoFarmSession: state.autoFarmSession,
      autoFarmSettings: state.autoFarmSettings
    }
  });
}

function getStorage() {
  if (!globalThis.localStorage) throw new Error("localStorage não está disponível.");
  return globalThis.localStorage;
}
