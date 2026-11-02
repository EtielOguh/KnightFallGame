import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { AccountStore, createKnightFallServer } from "../server.mjs";
import { GAME_CONFIG } from "../js/data.js";
import { createInitialState } from "../js/state.js";
import { compareGameStateUpdatedAt, loadGame, saveGame } from "../js/save.js";

async function withStore(run) {
  const directory = await mkdtemp(join(tmpdir(), "knightfall-accounts-"));
  try {
    const filePath = join(directory, "data", "local-accounts.json");
    const store = await new AccountStore(filePath).init();
    await run({ store, filePath, directory: join(directory, "data") });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function withApi(run) {
  const directory = await mkdtemp(join(tmpdir(), "knightfall-api-"));
  try {
    const dataFile = join(directory, "local-accounts.json");
    const server = await createKnightFallServer({ dataFile });
    const handler = server.listeners("request")[0];
    await run({ request: (path, options) => callHandler(handler, path, options), dataFile });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function callHandler(handler, path, options = {}) {
  const encoded = options.body === undefined ? null : Buffer.from(JSON.stringify(options.body));
  const request = Readable.from(encoded ? [encoded] : []);
  request.url = path;
  request.method = options.method || "GET";
  request.headers = { host: "127.0.0.1", ...(encoded ? { "content-type": "application/json" } : {}), ...(options.headers || {}) };
  const headers = new Map();
  const response = {
    statusCode: 0, headersSent: false, body: "",
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    writeHead(statusCode, values = {}) {
      this.statusCode = statusCode;
      this.headersSent = true;
      for (const [name, value] of Object.entries(values)) headers.set(name.toLowerCase(), value);
    },
    end(chunk) { if (chunk) this.body += chunk.toString(); }
  };
  await handler(request, response);
  return { status: response.statusCode, headers, body: response.body ? JSON.parse(response.body) : null };
}

function cookieFrom(response) {
  return String(response.headers.get("set-cookie") || "").split(";", 1)[0];
}

test("arquivo local separa contas e personagens", async () => {
  await withStore(async ({ filePath }) => {
    assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), { version: 3, accounts: [], characters: [] });
  });
});

test("cadastro normaliza e-mail, cria personagem separado e nunca grava senha pura", async () => {
  await withStore(async ({ store, filePath }) => {
    const result = await store.register({ email: "  TESTE@Example.Test ", password: "senha-segura", characterName: "Herói de Teste" });
    assert.equal(result.account.email, "teste@example.test");
    assert.equal(result.character.accountId, result.account.id);
    assert.equal(result.character.state.player.name, "Herói de Teste");
    const text = await readFile(filePath, "utf8");
    const database = JSON.parse(text);
    assert.equal(text.includes("senha-segura"), false);
    assert.equal(database.accounts[0].passwordHash.algorithm, "scrypt");
    assert.equal(database.characters[0].accountId, database.accounts[0].id);
  });
});

test("login usa comparação segura e cadastro impede e-mail duplicado", async () => {
  await withStore(async ({ store }) => {
    const { account } = await store.register({ email: "login@example.test", password: "senha-segura", characterName: "Sentinela" });
    assert.equal((await store.authenticate({ email: "LOGIN@example.test", password: "senha-segura" })).id, account.id);
    await assert.rejects(() => store.authenticate({ email: "login@example.test", password: "senha-errada" }), /incorretos/);
    await assert.rejects(() => store.register({ email: "login@example.test", password: "outra-senha", characterName: "Outro" }), /existe/);
  });
});

test("cadastro mantém mínimo de oito caracteres mesmo com login legado de seis", async () => {
  await withStore(async ({ store }) => {
    await assert.rejects(
      () => store.register({ email: "curta@example.test", password: "123456", characterName: "Senha Curta" }),
      /8 a 128/
    );
  });
});

test("API usa cookie HttpOnly, expõe sessão e não retorna hash", async () => {
  await withApi(async ({ request }) => {
    const registration = await request("/api/auth/register", {
      method: "POST",
      body: { email: "api@example.test", password: "senha-segura", characterName: "Cavaleiro API" }
    });
    assert.equal(registration.status, 201);
    const setCookie = registration.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.equal(JSON.stringify(registration.body).includes("password"), false);
    assert.equal(JSON.stringify(registration.body).includes("hash"), false);

    const cookie = cookieFrom(registration);
    const session = await request("/api/auth/session", { headers: { cookie } });
    assert.equal(session.status, 200);
    assert.equal(session.body.authenticated, true);
    assert.equal(session.body.account.email, "api@example.test");

    const unauthorized = await request("/api/character");
    assert.equal(unauthorized.status, 401);
  });
});

test("uma conta não pode sobrescrever o personagem de outra", async () => {
  await withApi(async ({ request }) => {
    const first = await request("/api/auth/register", { method: "POST", body: { email: "a@example.test", password: "senha-segura", characterName: "Conta A" } });
    const firstCookie = cookieFrom(first);
    await request("/api/auth/logout", { method: "POST", headers: { cookie: firstCookie } });
    const second = await request("/api/auth/register", { method: "POST", body: { email: "b@example.test", password: "senha-segura", characterName: "Conta B" } });
    const secondCookie = cookieFrom(second);
    const secondCharacter = await request("/api/character", { headers: { cookie: secondCookie } });
    const state = createInitialState({ name: "Conta A" });
    const forbidden = await request("/api/character", {
      method: "PUT", headers: { cookie: firstCookie },
      body: { characterId: secondCharacter.body.character.id, saveVersion: GAME_CONFIG.save.schemaVersion, state }
    });
    assert.equal(forbidden.status, 401, "logout invalida a sessão anterior");

    const firstLogin = await request("/api/auth/login", { method: "POST", body: { email: "a@example.test", password: "senha-segura" } });
    const ownershipDenied = await request("/api/character", {
      method: "PUT", headers: { cookie: cookieFrom(firstLogin) },
      body: { characterId: secondCharacter.body.character.id, saveVersion: GAME_CONFIG.save.schemaVersion, state }
    });
    assert.equal(ownershipDenied.status, 403);
  });
});

test("conta sem personagem pode importar um save validado sem apagar o save local", async () => {
  await withApi(async ({ request, dataFile }) => {
    const registration = await request("/api/auth/register", { method: "POST", body: { email: "import@example.test", password: "senha-segura", characterName: "Importado" } });
    const cookie = cookieFrom(registration);
    const database = JSON.parse(await readFile(dataFile, "utf8"));
    database.characters = [];
    await writeFile(dataFile, `${JSON.stringify(database, null, 2)}\n`, "utf8");
    assert.equal((await request("/api/character", { headers: { cookie } })).status, 404);

    const storage = new Map();
    const adapter = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
    const legacy = createInitialState({ name: "Herói Antigo" });
    legacy.player.coins = 777;
    assert.equal(saveGame(legacy, { storage: adapter }), true);
    const imported = loadGame({ storage: adapter });
    const response = await request("/api/character", {
      method: "PUT", headers: { cookie },
      body: { saveVersion: GAME_CONFIG.save.schemaVersion, state: imported }
    });
    assert.equal(response.status, 200);
    assert.equal((await request("/api/character", { headers: { cookie } })).body.character.state.player.coins, 777);
    assert.equal(loadGame({ storage: adapter }).player.coins, 777, "a importação não remove o save de origem");
  });
});

test("comparação de conflito usa metadata.updatedAt sem alterar o save visitante", () => {
  const older = createInitialState({ name: "Visitante" });
  const newer = structuredClone(older);
  older.metadata.updatedAt = "2026-01-01T00:00:00.000Z";
  newer.metadata.updatedAt = "2026-01-02T00:00:00.000Z";
  assert.equal(compareGameStateUpdatedAt(newer, older), 1);
  assert.equal(compareGameStateUpdatedAt(older, newer), -1);
  assert.equal(compareGameStateUpdatedAt(older, structuredClone(older)), 0);
});

test("save validado persiste após reabrir o armazenamento e escrita é atômica", async () => {
  await withStore(async ({ store, filePath, directory }) => {
    const { account, character } = await store.register({ email: "save@example.test", password: "senha-segura", characterName: "Aldric Local" });
    const state = createInitialState({ name: "Aldric Local" });
    state.player.coins = 321;
    await store.setCharacter(account.id, { characterId: character.id, saveVersion: GAME_CONFIG.save.schemaVersion, state });
    const reopened = await new AccountStore(filePath).init();
    assert.equal((await reopened.getCharacter(account.id)).state.player.coins, 321);
    assert.equal(JSON.parse(await readFile(filePath, "utf8")).characters[0].state.player.coins, 321);
    assert.equal((await readdir(directory)).some(name => name.endsWith(".tmp")), false);
    await assert.rejects(() => store.setCharacter(account.id, { characterId: character.id, saveVersion: 1, state: {} }), /Save local inválido|versão atual/);
  });
});
