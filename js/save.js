import { GAME_CONFIG } from "./data.js";
import { createSaveSnapshot, normalizeGameState, STATE_SCHEMA_VERSION, validateGameState } from "./state.js";

export const SAVE_KEY = GAME_CONFIG.save.primaryKey;
const SAVE_VERSION = STATE_SCHEMA_VERSION;
const LEGACY_SAVE_KEYS = Object.freeze([...GAME_CONFIG.save.legacyKeys]);
let localCharacterId = null;

export function saveGame(gameState, options = {}) {
  const logger = options.logger || console;
  try {
    const storage = options.storage || getStorage();
    const snapshot = options.preserveTimestamp ? normalizeGameState(gameState) : createSaveSnapshot(gameState);
    storage.setItem(SAVE_KEY, serializeGame(snapshot));
    options.onSnapshot?.(snapshot);
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

export async function registerLocalAccount(input, options = {}) {
  const auth = await requestLocalApi("/api/auth/register", {
    method: "POST",
    body: { email: input?.email, password: input?.password, characterName: input?.characterName },
    signal: options.signal
  });
  return loadAuthenticatedCharacter(auth.account, options);
}

export async function loginLocalAccount(input, options = {}) {
  const auth = await requestLocalApi("/api/auth/login", {
    method: "POST",
    body: { email: input?.email, password: input?.password },
    signal: options.signal
  });
  return loadAuthenticatedCharacter(auth.account, options);
}

export async function logoutLocalAccount(options = {}) {
  try {
    await requestLocalApi("/api/auth/logout", { method: "POST", signal: options.signal });
  } finally {
    localCharacterId = null;
  }
}

export async function restoreLocalSession(options = {}) {
  const session = await requestLocalApi("/api/auth/session", { signal: options.signal });
  return loadAuthenticatedCharacter(session.account, options);
}

export async function saveLocalAccount(gameState, options = {}) {
  const snapshot = normalizeGameState(gameState);
  const payload = await requestLocalApi("/api/character", {
    method: "PUT",
    body: { ...(localCharacterId ? { characterId: localCharacterId } : {}), saveVersion: SAVE_VERSION, state: snapshot },
    signal: options.signal,
    keepalive: options.keepalive
  });
  localCharacterId = payload.character.id;
  return payload.character;
}

async function loadAuthenticatedCharacter(account, options = {}) {
  if (!account?.id) throw new Error("Resposta de autenticação inválida.");
  try {
    const payload = await requestLocalApi("/api/character", { signal: options.signal });
    if (!payload.character?.id || !payload.character.state) throw new Error("Resposta de personagem inválida.");
    localCharacterId = payload.character.id;
    return { account: { ...account, characterName: payload.character.name, hasSave: true }, state: normalizeGameState(payload.character.state), hasCharacter: true };
  } catch (error) {
    if (error.status !== 404) throw error;
    localCharacterId = null;
    return { account: { ...account, characterName: null, hasSave: false }, state: null, hasCharacter: false };
  }
}

export function compareGameStateUpdatedAt(left, right) {
  const leftTime = Date.parse(left?.metadata?.updatedAt) || 0;
  const rightTime = Date.parse(right?.metadata?.updatedAt) || 0;
  return Math.sign(leftTime - rightTime);
}

function serializeGame(gameState) {
  const validation = validateGameState(gameState);
  if (!validation.valid) throw new TypeError(`Estado recusado pelo save: ${validation.errors.join("; ")}`);
  return JSON.stringify({
    game: GAME_CONFIG.save.gameId,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state: gameState
  });
}

async function requestLocalApi(path, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    signal: options.signal
  };
  if (options.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  if (options.keepalive) init.keepalive = true;
  const response = await fetch(path, init);
  let payload = null;
  try { payload = await response.json(); } catch { /* resposta inválida tratada abaixo */ }
  if (!response.ok) {
    const error = new Error(payload?.error || `API local respondeu com status ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  if (!payload || typeof payload !== "object") throw new Error("Resposta inválida da API local.");
  return payload;
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
  if (version < 7) migrated = migrateToV7(migrated);
  if (version < 8) migrated = migrateToV8(migrated);
  if (version < 9) migrated = migrateToV9(migrated);
  return normalizeGameState(migrated);
}

function migrateToV7(state) {
  const world = state.world && typeof state.world === "object" ? state.world : {};
  const regionProgress = world.regionProgress && typeof world.regionProgress === "object" ? world.regionProgress : {};
  const migratedRegions = Object.fromEntries(Object.entries(regionProgress).map(([regionId, progress]) => {
    const source = progress && typeof progress === "object" ? progress : {};
    return [regionId, {
      ...source,
      selectedFloor: source.selectedFloor ?? source.currentExpeditionFloor ?? source.highestUnlockedFloor ?? 1,
      floorKills: source.floorKills || {},
      floorObjectivesCompleted: source.floorObjectivesCompleted || {}
    }];
  }));
  return {
    ...state,
    schemaVersion: 7,
    world: { ...world, regionProgress: migratedRegions }
  };
}

function migrateToV8(state) {
  const world = state.world && typeof state.world === "object" ? state.world : {};
  const regionProgress = world.regionProgress && typeof world.regionProgress === "object" ? world.regionProgress : {};
  const migratedRegions = Object.fromEntries(Object.entries(regionProgress).map(([regionId, progress]) => [regionId, {
    ...(progress && typeof progress === "object" ? progress : {}),
    // O progresso antigo era permanente por andar e não representava uma
    // incursão isolada. Ele permanece como histórico, mas não libera o chefe.
    expedition: null
  }]));
  return {
    ...state,
    schemaVersion: 8,
    world: { ...world, scene: "village", regionProgress: migratedRegions }
  };
}

function migrateToV9(state) {
  // A normalização ainda lê bossesDefeated para transferir vitórias antigas
  // a regionProgress. Os demais campos legados são deliberadamente ignorados e
  // deixam de ser gravados no snapshot canônico da versão 9.
  return { ...state, schemaVersion: 9 };
}

function migrateVisualV1(state) {
  return normalizeGameState({
    ...state,
    world: {
      scene: state.scene,
      caveVisits: state.caveVisits,
      regionProgress: {}
    },
    settings: { audioEnabled: state.sound }
  });
}

function migrateLegacyTerminal(state) {
  return normalizeGameState({
    ...state,
    player: { ...state.player, inventory: state.inventory },
    world: { ...state.world, scene: "village", caveVisits: 0 },
    settings: { audioEnabled: state.settings?.musicEnabled ?? true }
  });
}

function getStorage() {
  if (!globalThis.localStorage) throw new Error("localStorage não está disponível.");
  return globalThis.localStorage;
}
