import { createServer as createHttpServer } from "node:http";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { GAME_CONFIG } from "./js/data.js";
import { createInitialState, normalizeGameState, validateGameState } from "./js/state.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_FILE = resolve(ROOT, "data/local-accounts.json");
const BODY_LIMIT_BYTES = 256 * 1024;
const HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const DATABASE_VERSION = 3;
const SESSION_COOKIE = "knightfall_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const ID_PATTERN = /^[a-f0-9-]{36}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCRYPT_KEY_LENGTH = 64;
const scryptAsync = promisify(scrypt);
const STATIC_FILES = new Map([["/", "index.html"], ["/index.html", "index.html"], ["/style.css", "style.css"]]);
const MIME_TYPES = new Map([[".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".js", "text/javascript; charset=utf-8"]]);

export class AccountStore {
  constructor(filePath = DEFAULT_DATA_FILE) {
    this.filePath = resolve(filePath);
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await mkdir(dirname(this.filePath), { recursive: true });
    try { await stat(this.filePath); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      await writeJsonAtomic(this.filePath, emptyDatabase());
    }
    let database = JSON.parse(await readFile(this.filePath, "utf8"));
    if (database?.version !== DATABASE_VERSION) {
      database = migrateDatabase(database);
      validateDatabase(database);
      await writeJsonAtomic(this.filePath, database);
    } else validateDatabase(database);
    return this;
  }

  async read() {
    const database = JSON.parse(await readFile(this.filePath, "utf8"));
    validateDatabase(database);
    return database;
  }

  async getAccount(accountId) {
    assertId(accountId, "conta");
    const database = await this.read();
    return database.accounts.find(account => account.id === accountId) || null;
  }

  async getCharacter(accountId) {
    assertId(accountId, "conta");
    const database = await this.read();
    return database.characters.find(character => character.accountId === accountId) || null;
  }

  async register(input) {
    const credentials = validateRegistrationInput(input);
    const passwordHash = await hashPassword(credentials.password);
    return this.mutate(database => {
      if (database.accounts.some(account => account.email === credentials.email)) throw httpError(409, "Já existe uma conta com este e-mail.");
      const now = new Date().toISOString();
      const account = { id: randomUUID(), email: credentials.email, passwordHash, createdAt: now, updatedAt: now };
      const character = {
        id: randomUUID(), accountId: account.id, name: credentials.characterName,
        createdAt: now, updatedAt: now, saveVersion: GAME_CONFIG.save.schemaVersion,
        state: createInitialState({ name: credentials.characterName })
      };
      database.accounts.push(account);
      database.characters.push(character);
      return { account, character };
    });
  }

  async authenticate(input) {
    const credentials = validateLoginInput(input);
    const database = await this.read();
    const account = database.accounts.find(entry => !entry.legacy && entry.email === credentials.email);
    if (!account || !(await verifyPassword(credentials.password, account.passwordHash))) throw httpError(401, "E-mail ou senha incorretos.");
    return account;
  }

  async setCharacter(accountId, input) {
    assertId(accountId, "conta");
    const canonical = validateCharacterSave(input);
    return this.mutate(database => {
      let owned = database.characters.find(character => character.accountId === accountId);
      if (canonical.characterId) {
        const requested = database.characters.find(character => character.id === canonical.characterId);
        if (requested && requested.accountId !== accountId) throw httpError(403, "Este personagem não pertence à sessão atual.");
        if (owned && canonical.characterId !== owned.id) throw httpError(403, "Este personagem não pertence à sessão atual.");
      }
      if (!owned) {
        const now = new Date().toISOString();
        owned = { id: randomUUID(), accountId, name: canonical.state.player.name, createdAt: now, updatedAt: now, saveVersion: canonical.saveVersion, state: canonical.state };
        database.characters.push(owned);
      }
      owned.name = canonical.state.player.name;
      owned.state = canonical.state;
      owned.saveVersion = canonical.saveVersion;
      owned.updatedAt = new Date().toISOString();
      const account = database.accounts.find(entry => entry.id === accountId);
      if (account) account.updatedAt = owned.updatedAt;
      return owned;
    });
  }

  mutate(operation) {
    const pending = this.writeQueue.then(async () => {
      const database = await this.read();
      const result = operation(database);
      await writeJsonAtomic(this.filePath, database);
      return result;
    });
    this.writeQueue = pending.catch(() => {});
    return pending;
  }
}

export class SessionStore {
  constructor() { this.sessions = new Map(); }
  create(accountId) {
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, { accountId, expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 });
    return token;
  }
  resolve(token) {
    const session = token ? this.sessions.get(token) : null;
    if (!session) return null;
    if (session.expiresAt <= Date.now()) { this.sessions.delete(token); return null; }
    return session.accountId;
  }
  destroy(token) { if (token) this.sessions.delete(token); }
}

export async function createKnightFallServer(options = {}) {
  const root = resolve(options.root || ROOT);
  const store = await new AccountStore(options.dataFile || DEFAULT_DATA_FILE).init();
  const sessions = options.sessions || new SessionStore();
  return createHttpServer(async (request, response) => {
    applySecurityHeaders(response);
    try {
      validateHost(request.headers.host);
      const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) await handleApi(request, response, url, store, sessions);
      else await serveStatic(request, response, url.pathname, root);
    } catch (error) {
      if (!response.headersSent) sendJson(response, error.statusCode || 500, { error: error.statusCode ? error.message : "Erro interno do servidor local." });
      if (!error.statusCode) console.error("[KnightFall local]", error);
    }
  });
}

async function handleApi(request, response, url, store, sessions) {
  if (url.pathname === "/api/auth/register" && request.method === "POST") {
    const { account, character } = await store.register(await readJsonBody(request));
    setSessionCookie(response, sessions.create(account.id));
    return sendJson(response, 201, { account: publicAccount(account), character: publicCharacter(character, false) });
  }
  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const account = await store.authenticate(await readJsonBody(request));
    const character = await store.getCharacter(account.id);
    setSessionCookie(response, sessions.create(account.id));
    return sendJson(response, 200, { account: publicAccount(account), character: character ? publicCharacter(character, false) : null });
  }
  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    const { account } = await requireSession(request, store, sessions);
    const character = await store.getCharacter(account.id);
    return sendJson(response, 200, { authenticated: true, account: publicAccount(account), character: character ? publicCharacter(character, false) : null });
  }
  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    sessions.destroy(readSessionToken(request));
    clearSessionCookie(response);
    return sendJson(response, 200, { ok: true });
  }
  if (url.pathname === "/api/character" && request.method === "GET") {
    const { account } = await requireSession(request, store, sessions);
    const character = await store.getCharacter(account.id);
    if (!character) throw httpError(404, "Personagem local não encontrado.");
    return sendJson(response, 200, { character: publicCharacter(character, true) });
  }
  if (url.pathname === "/api/character" && request.method === "PUT") {
    const { account } = await requireSession(request, store, sessions);
    const character = await store.setCharacter(account.id, await readJsonBody(request));
    return sendJson(response, 200, { character: publicCharacter(character, false) });
  }
  const known = ["/api/auth/register", "/api/auth/login", "/api/auth/session", "/api/auth/logout", "/api/character"];
  if (known.includes(url.pathname)) throw httpError(405, "Método não permitido.");
  throw httpError(404, "Endpoint local não encontrado.");
}

async function requireSession(request, store, sessions) {
  const token = readSessionToken(request);
  const accountId = sessions.resolve(token);
  if (!accountId) throw httpError(401, "Sessão local inválida ou encerrada.");
  const account = await store.getAccount(accountId);
  if (!account || account.legacy) {
    sessions.destroy(token);
    throw httpError(401, "Sessão local inválida ou encerrada.");
  }
  return { account };
}

function readSessionToken(request) {
  const cookies = String(request.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    const name = cookie.slice(0, separator).trim();
    if (name === SESSION_COOKIE) return cookie.slice(separator + 1).trim();
  }
  return null;
}

function setSessionCookie(response, token) {
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`);
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

async function serveStatic(request, response, pathname, root) {
  if (!new Set(["GET", "HEAD"]).has(request.method)) throw httpError(405, "Método não permitido.");
  let relative = STATIC_FILES.get(pathname);
  if (!relative && /^\/js\/[a-z0-9-]+\.js$/.test(pathname)) relative = pathname.slice(1);
  if (!relative) throw httpError(404, "Arquivo não encontrado.");
  const filePath = resolve(root, relative);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) throw httpError(403, "Caminho recusado.");
  let contents;
  try { contents = await readFile(filePath); }
  catch (error) { if (error.code === "ENOENT") throw httpError(404, "Arquivo não encontrado."); throw error; }
  response.writeHead(200, { "Content-Type": MIME_TYPES.get(extname(filePath)) || "application/octet-stream", "Content-Length": contents.length, "Cache-Control": "no-store" });
  response.end(request.method === "HEAD" ? undefined : contents);
}

async function readJsonBody(request) {
  const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim();
  if (contentType !== "application/json") throw httpError(415, "Use Content-Type application/json.");
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT_BYTES) { request.resume(); throw httpError(413, `Requisição excede ${BODY_LIMIT_BYTES} bytes.`); }
    chunks.push(chunk);
  }
  if (!chunks.length) throw httpError(400, "Corpo JSON ausente.");
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw httpError(400, "JSON inválido."); }
}

function validateRegistrationInput(input) {
  const { email, password } = validateLoginInput(input);
  if (password.length < 8) throw httpError(400, "A senha deve ter de 8 a 128 caracteres.");
  const characterName = typeof input.characterName === "string" ? input.characterName.trim() : "";
  if (characterName.length < 2 || characterName.length > 40 || /[\u0000-\u001f\u007f]/.test(characterName)) throw httpError(400, "Nome do personagem deve ter de 2 a 40 caracteres válidos.");
  return { email, password, characterName };
}

function validateLoginInput(input) {
  if (!isPlainObject(input)) throw httpError(400, "Dados de acesso inválidos.");
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw httpError(400, "Informe um e-mail válido.");
  // Login accepts six characters for development accounts created before the
  // current eight-character registration policy. New accounts remain stricter.
  if (password.length < 6 || password.length > 128 || Buffer.byteLength(password, "utf8") > 512) throw httpError(400, "A senha de acesso deve ter de 6 a 128 caracteres.");
  return { email, password };
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH);
  return { algorithm: "scrypt", salt: salt.toString("base64"), hash: Buffer.from(hash).toString("base64"), keyLength: SCRYPT_KEY_LENGTH };
}

async function verifyPassword(password, descriptor) {
  if (!validPasswordHash(descriptor)) return false;
  const expected = Buffer.from(descriptor.hash, "base64");
  const actual = Buffer.from(await scryptAsync(password, Buffer.from(descriptor.salt, "base64"), descriptor.keyLength));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function validateCharacterSave(input) {
  if (!isPlainObject(input) || !Number.isInteger(input.saveVersion) || !isPlainObject(input.state)) throw httpError(400, "Save local inválido.");
  if (input.saveVersion !== GAME_CONFIG.save.schemaVersion) throw httpError(400, "A API local aceita apenas a versão atual do save.");
  if (input.characterId !== undefined) assertId(input.characterId, "personagem");
  let state;
  try { state = normalizeGameState(input.state); }
  catch { throw httpError(400, "Estado do personagem inválido."); }
  const validation = validateGameState(state);
  if (!validation.valid) throw httpError(400, `Estado recusado: ${validation.errors.join("; ")}`);
  return { characterId: input.characterId || null, saveVersion: GAME_CONFIG.save.schemaVersion, state };
}

function validateDatabase(database) {
  if (!isPlainObject(database) || database.version !== DATABASE_VERSION || !Array.isArray(database.accounts) || !Array.isArray(database.characters)) throw new TypeError("Formato de data/local-accounts.json inválido.");
  const accountIds = new Set();
  const characterIds = new Set();
  const emails = new Set();
  const owners = new Set();
  for (const account of database.accounts) {
    if (!isPlainObject(account)) throw new TypeError("Conta local inválida no arquivo de dados.");
    assertId(account.id, "conta");
    if (accountIds.has(account.id) || !validIsoDate(account.createdAt) || !validIsoDate(account.updatedAt)) throw new TypeError("Conta local duplicada ou com datas inválidas.");
    if (!account.legacy) {
      const email = typeof account.email === "string" ? account.email.trim().toLowerCase() : "";
      if (!EMAIL_PATTERN.test(email) || email !== account.email || emails.has(email)) throw new TypeError("E-mail de conta local inválido ou duplicado.");
      if (!validPasswordHash(account.passwordHash) || Object.hasOwn(account, "password")) throw new TypeError("Credencial local inválida.");
      emails.add(email);
    }
    accountIds.add(account.id);
  }
  for (const character of database.characters) {
    if (!isPlainObject(character)) throw new TypeError("Personagem local inválido no arquivo de dados.");
    assertId(character.id, "personagem");
    assertId(character.accountId, "conta");
    if (characterIds.has(character.id) || owners.has(character.accountId) || !accountIds.has(character.accountId)) throw new TypeError("Personagem duplicado ou sem conta válida.");
    if (typeof character.name !== "string" || character.name.length < 1 || character.name.length > 40) throw new TypeError("Nome de personagem inválido.");
    if (!validIsoDate(character.createdAt) || !validIsoDate(character.updatedAt) || character.saveVersion !== GAME_CONFIG.save.schemaVersion) throw new TypeError("Metadados de personagem inválidos.");
    const state = normalizeGameState(character.state);
    if (!validateGameState(state).valid) throw new TypeError("Estado inválido no arquivo de personagens.");
    characterIds.add(character.id);
    owners.add(character.accountId);
  }
}

function validPasswordHash(descriptor) {
  if (!isPlainObject(descriptor) || descriptor.algorithm !== "scrypt" || descriptor.keyLength !== SCRYPT_KEY_LENGTH) return false;
  try { return Buffer.from(descriptor.salt, "base64").length === 16 && Buffer.from(descriptor.hash, "base64").length === SCRYPT_KEY_LENGTH; }
  catch { return false; }
}

function publicAccount(account) {
  return { id: account.id, email: account.email, createdAt: account.createdAt, updatedAt: account.updatedAt };
}

function publicCharacter(character, includeState) {
  const result = { id: character.id, name: character.name, createdAt: character.createdAt, updatedAt: character.updatedAt, saveVersion: character.saveVersion };
  if (includeState) result.state = character.state;
  return result;
}

function migrateDatabase(database) {
  if (!isPlainObject(database) || !Array.isArray(database.accounts)) throw new TypeError("Formato legado de contas locais inválido.");
  const source = database.version === 1
    ? database.accounts.map(account => ({ ...account, legacy: true, email: null, passwordHash: null, characterName: account.displayName || account.username || "Viajante" }))
    : database.version === 2 ? database.accounts : null;
  if (!source) throw new TypeError("Versão do arquivo de contas locais não suportada.");
  const accounts = [];
  const characters = [];
  for (const old of source) {
    const createdAt = validIsoDate(old.createdAt) ? old.createdAt : new Date().toISOString();
    const updatedAt = validIsoDate(old.updatedAt) ? old.updatedAt : createdAt;
    const legacy = Boolean(old.legacy || !old.email || !old.passwordHash);
    accounts.push({ id: old.id, email: legacy ? null : String(old.email).trim().toLowerCase(), passwordHash: legacy ? null : old.passwordHash, legacy, createdAt, updatedAt });
    const name = String(old.characterName || old.displayName || old.username || "Viajante").trim().slice(0, 40) || "Viajante";
    let state;
    try { state = old.save?.state ? normalizeGameState(old.save.state) : createInitialState({ name }); }
    catch { state = createInitialState({ name }); }
    characters.push({ id: randomUUID(), accountId: old.id, name: state.player.name, createdAt, updatedAt, saveVersion: GAME_CONFIG.save.schemaVersion, state });
  }
  return { version: DATABASE_VERSION, accounts, characters };
}

function validateHost(hostHeader = "") {
  const hostname = hostHeader.startsWith("[") ? hostHeader.slice(1, hostHeader.indexOf("]")) : hostHeader.split(":", 1)[0].toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) throw httpError(403, "Este servidor aceita somente acesso local.");
}

function assertId(value, label) { if (!ID_PATTERN.test(String(value || ""))) throw httpError(400, `Identificador de ${label} inválido.`); }

function applySecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; media-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

function sendJson(response, statusCode, body) {
  const contents = Buffer.from(`${JSON.stringify(body)}\n`);
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Content-Length": contents.length, "Cache-Control": "no-store" });
  response.end(contents);
}

function emptyDatabase() { return { version: DATABASE_VERSION, accounts: [], characters: [] }; }
function isPlainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function validIsoDate(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function httpError(statusCode, message) { return Object.assign(new Error(message), { statusCode }); }

async function writeJsonAtomic(filePath, value) {
  const tempPath = resolve(dirname(filePath), `.local-accounts.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(tempPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(tempPath, filePath);
  } catch (error) {
    await handle?.close().catch(() => {});
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

async function start() {
  const requestedPort = Number(process.env.PORT || DEFAULT_PORT);
  const port = Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535 ? requestedPort : DEFAULT_PORT;
  const server = await createKnightFallServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, HOST, () => { server.off("error", rejectListen); resolveListen(); });
  });
  const address = server.address();
  console.log(`KnightFall local: http://${HOST}:${address.port}`);
  console.log("Somente desenvolvimento local; não use este servidor em produção.");
  console.log(`Contas e personagens: ${DEFAULT_DATA_FILE}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  start().catch(error => { console.error("[KnightFall local] Falha ao iniciar.", error); process.exitCode = 1; });
}
