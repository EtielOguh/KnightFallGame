import { createPlayer, ORIGINS } from "./player.js";
import { saveGame, loadGame, deleteSave, hasSave } from "./save.js";
import { Terminal } from "./terminal.js";
import { AREAS, ENEMIES, ITEMS, SKILLS, SET_BONUSES } from "./data.js";
import { gameAudio } from "./music.js";
import {
  BALANCE, WEAPON_TYPES, MASTERY_MILESTONES, masteryExpRequired, masteryDamageMultiplier,
  addMasteryExp, calculateTraining, sanitizedElapsedSeconds, playerExpRequired,
  enemyExperience, levelRewardMultiplier, estimateAutoFarm, simulateAutoFarm, formatDuration
} from "./progression.js";

const terminal = new Terminal({
  output: document.querySelector("#terminal-output"),
  form: document.querySelector("#terminal-form"),
  input: document.querySelector("#terminal-input")
});

const createInitialState = () => ({
  player: null,
  inventory: [],
  world: { currentArea: "ruinas_despertar", explorationCount: 0, regionProgress: {}, bossesDefeated: {}, bossPity: {} },
  flags: {},
  combat: null,
  expedition: { active: false, steps: 0 },
  trainingSession: null,
  autoFarmSession: null,
  autoFarmSettings: { autoPotion: true, potionThreshold: .4, preserveRarePotions: true, stopWhenFull: true, stopWithoutPotions: false },
  settings: { musicEnabled: true },
  currentScreen: "mainMenu"
});

let gameState = createInitialState();
let creationDraft = { name: "", originKey: null };
let screenOptions = new Map();
let expeditionTimer = null;
let autoAttackTimer = null;

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function unlockOpeningMusic() {
  if (gameState.settings.musicEnabled && !gameState.combat) gameAudio.startMenu();
}

window.addEventListener("pointerdown", unlockOpeningMusic, { once: true });
window.addEventListener("keydown", unlockOpeningMusic, { once: true });

function setScreen(name, render) {
  if (expeditionTimer) window.clearTimeout(expeditionTimer);
  expeditionTimer = null;
  if (autoAttackTimer) window.clearTimeout(autoAttackTimer);
  autoAttackTimer = null;
  gameState.currentScreen = name;
  screenOptions = new Map();
  terminal.clear();
  terminal.output.classList.toggle("menu-screen", name === "mainMenu");
  terminal.form.classList.toggle("visually-hidden", name !== "characterName");
  render();
  if (gameState.player && name !== "mainMenu") autoSave();
  if (name === "characterName") terminal.input.focus();
  else terminal.focus();
}

function addOption(key, label, action, style = "") {
  screenOptions.set(String(key).toLocaleLowerCase("pt-BR"), action);
  terminal.option(key, label, style);
}

function handleInput(rawInput) {
  const input = rawInput.trim();
  const normalized = input.toLocaleLowerCase("pt-BR");
  const action = screenOptions.get(normalized);
  if (action) { action(); return; }
  if (gameState.currentScreen === "characterName") { acceptName(input); return; }
  const command = commands[normalized];
  if (command) { command(); return; }
  terminal.print(`Entrada desconhecida: “${input}”. Digite help para ver os comandos.`, "error");
}

terminal.onInput(handleInput);
terminal.onOption(handleInput);

const commands = {
  help: renderHelp,
  status: () => outsideCombat(() => gameState.player ? renderStatus() : noCharacter()),
  inventory: () => outsideCombat(() => gameState.player ? renderInventory() : noCharacter()),
  equip: () => outsideCombat(() => gameState.player ? renderEquipment() : noCharacter()),
  skills: () => gameState.player ? renderSkills() : noCharacter(),
  areas: () => outsideCombat(() => gameState.player ? renderAreas() : noCharacter()),
  music: toggleMusic,
  save: () => {
    if (!gameState.player) return noCharacter();
    saveGame(gameState);
    terminal.print("Autosave atualizado.", "success");
  },
  clear: () => terminal.clear()
};

function outsideCombat(action) {
  if (gameState.combat) terminal.print("Conclua ou fuja da batalha primeiro.", "error");
  else action();
}

function noCharacter() { terminal.print("Crie ou carregue um personagem primeiro.", "error"); }

function autoSave() {
  if (gameState.player) saveGame(gameState);
}

function getRegionProgress(areaId = gameState.world.currentArea) {
  return gameState.world.regionProgress[areaId] || 0;
}

function exitGame() {
  gameAudio.stopMusic();
  terminal.clear();
  terminal.print("KNIGHTFALL", "hero-title");
  terminal.print("A janela pode ser fechada com segurança.", "hero-subtitle");
  window.close();
}

function renderMainMenu(message = "") {
  if (gameState.settings.musicEnabled) gameAudio.startMenu();
  else gameAudio.stopMusic();
  setScreen("mainMenu", () => {
    terminal.print("KNIGHTFALL", "hero-title");
    terminal.print("EXPLORE • COMBATA • EVOLUA", "hero-subtitle");
    if (message) terminal.print(message, message.includes("Nenhuma") || message.includes("Falha") ? "error" : "success");
    const saved = loadGame();
    addOption(1, saved ? `Jogar — ${saved.player.name}, Nv.${saved.player.level}` : "Jogar com save existente — indisponível", continueGame);
    addOption(2, "Criar novo jogo", startCharacterCreation);
    addOption(3, "Sair", exitGame);
  });
}

function startCharacterCreation() {
  creationDraft = { name: "", originKey: null };
  setScreen("characterName", () => {
    terminal.separator("NOVO PERSONAGEM");
    terminal.print("Qual é o seu nome?");
    terminal.print("Digite um nome e pressione Enter.", "muted");
    addOption(0, "Voltar", renderMainMenu);
  });
}

function acceptName(name) {
  const cleanName = name.replace(/\s+/g, " ").trim();
  if (cleanName.length < 2 || cleanName.length > 24) return terminal.print("O nome deve ter entre 2 e 24 caracteres.", "error");
  creationDraft.name = cleanName;
  renderOriginSelection();
}

function renderOriginSelection() {
  setScreen("originSelection", () => {
    terminal.separator("ORIGEM");
    terminal.print(`Nome: ${creationDraft.name}`);
    for (const [key, origin] of Object.entries(ORIGINS)) {
      addOption(key, `${origin.name} — ${origin.description}`, () => {
        creationDraft.originKey = key;
        renderCharacterConfirmation();
      });
    }
    addOption(0, "Voltar", startCharacterCreation);
  });
}

function renderCharacterConfirmation() {
  const player = createPlayer(creationDraft.name, creationDraft.originKey);
  setScreen("characterConfirmation", () => {
    terminal.separator("CONFIRMAR");
    terminal.print(`${player.name} — ${player.origin}`, "title");
    printAttributes(player.attributes);
    terminal.print(`HP: ${player.maxHp} | Moedas: ${player.coins}`);
    addOption(1, "Começar", () => beginNewGame(player));
    addOption(2, "Voltar", renderOriginSelection);
  });
}

function beginNewGame(player) {
  gameState = createInitialState();
  gameState.player = player;
  addItem("pocao_menor", 2);
  saveGame(gameState);
  renderOpening();
}

function renderOpening() {
  setScreen("opening", () => {
    terminal.print("Inicializando consciência...", "success");
    terminal.print("corpo.............. OK");
    terminal.print("memória............ CORROMPIDA", "error");
    terminal.print("instinto de luta... DESPERTO", "success");
    terminal.print("...");
    terminal.print("Você abre os olhos sobre a pedra fria.");
    terminal.print(`Uma memória retorna: “${gameState.player.name}.”`, "title");
    terminal.print("Ao longe, alguma coisa rosna. Sobreviver será sua primeira resposta.");
    addOption(1, "Erguer-se", renderGame);
  });
}

function renderGame(message = "") {
  gameAudio.stopMusic();
  gameState.combat = null;
  const player = gameState.player;
  const area = AREAS[gameState.world.currentArea];
  const progress = getRegionProgress();
  const bossReady = progress >= area.bossKills;
  setScreen("game", () => {
    terminal.separator(area.name.toLocaleUpperCase("pt-BR"));
    printPlayerBars();
    terminal.print(message || area.description);
    terminal.print(`Criaturas: Nv.${area.levels[0]}–${area.levels[1]} | Rastro do chefe: ${Math.min(progress, area.bossKills)}/${area.bossKills}`, bossReady ? "success" : "muted");
    addOption(1, "Iniciar expedição — encontros contínuos", beginExpedition);
    addOption(2, "Personagem e habilidades", renderStatus);
    addOption(3, "Inventário", renderInventory);
    addOption(4, "Equipamentos", renderEquipment);
    if (bossReady) addOption("b", `Enfrentar chefe: ${ENEMIES[area.boss].name}`, () => startCombat(area.boss), "boss-item");
    addOption("m", "Abrir menu", renderGameMenu);
  });
}

function beginExpedition() {
  gameState.expedition.active = true;
  gameState.expedition.steps = 0;
  autoSave();
  explore();
}

function endExpedition(message = "Você encerra a expedição e retorna ao ponto seguro.") {
  gameState.expedition.active = false;
  autoSave();
  renderGame(message);
}

function renderGameMenu() {
  setScreen("gameMenu", () => {
    terminal.separator("MENU");
    terminal.print("Campanha salva automaticamente.", "success");
    addOption(1, "Viajar — escolher outra região", renderAreas);
    addOption(2, "Personagem — atributos e habilidades", renderStatus);
    addOption(3, "Inventário — consultar e usar itens", renderInventory);
    addOption(4, "Equipamentos — trocar seu arsenal ativo", renderEquipment);
    addOption(5, "Evoluir item — fortalecer equipamentos", renderUpgradeList);
    addOption(6, "Campo de Treinamento — aumentar domínio de armas", renderTrainingGround);
    addOption(7, "Auto Farm — lutar e coletar recursos offline", renderAutoFarm);
    addOption(8, "Mochila e vendas — liberar ou comprar espaço", renderBagMenu);
    addOption("a", `Música: ${gameState.settings.musicEnabled ? "LIGADA" : "DESLIGADA"}`, () => { toggleMusic(); renderGameMenu(); });
    addOption(9, "Apagar campanha", confirmDeleteSave);
    addOption("s", "Salvar e sair ao menu principal", saveAndExit);
    addOption(0, "Fechar menu", renderGame);
  });
}

function printPlayerBars() {
  const player = gameState.player;
  terminal.print(`${player.name} — Nível ${player.level}  EXP ${player.exp}/${player.expToNext}`);
  terminal.print(`HP ${bar(player.hp, getMaxHp())} ${player.hp}/${getMaxHp()}  EN ${player.energy}/${player.maxEnergy}`);
}

function bar(value, max) {
  const filled = clamp(Math.round((value / max) * 16), 0, 16);
  return `${"█".repeat(filled)}${"░".repeat(16 - filled)}`;
}

function explore() {
  if (!gameState.expedition.active) gameState.expedition.active = true;
  gameState.expedition.steps += 1;
  gameState.world.explorationCount += 1;
  const area = AREAS[gameState.world.currentArea];
  if (Math.random() < .16) {
    const coins = randomInt(3, 8) + area.levels[0];
    gameState.player.coins += coins;
    autoSave();
    renderExpeditionEvent(`Você vasculha o caminho e encontra ${coins} moedas. A expedição continua...`);
    return;
  }
  const enemyId = area.enemies[randomInt(0, area.enemies.length - 1)];
  startCombat(enemyId);
}

function renderExpeditionEvent(message) {
  setScreen("expedition", () => {
    const area = AREAS[gameState.world.currentArea];
    terminal.separator(`EXPEDIÇÃO • ${area.name.toLocaleUpperCase("pt-BR")}`);
    printPlayerBars();
    terminal.print(`Etapa ${gameState.expedition.steps}`, "muted");
    terminal.print(message, "success");
    terminal.print("Procurando o próximo encontro...", "muted");
    addOption(0, "Encerrar expedição", () => endExpedition());
  });
  expeditionTimer = window.setTimeout(() => {
    expeditionTimer = null;
    if (gameState.expedition.active && !gameState.combat) explore();
  }, 1100);
}

function startCombat(enemyId) {
  const template = ENEMIES[enemyId];
  const area = AREAS[gameState.world.currentArea];
  const level = template.boss ? template.level : randomInt(area.levels[0], area.levels[1]);
  const scale = template.boss ? 1 : 1 + (level - area.levels[0]) * .1;
  gameState.combat = {
    enemyId,
    areaId: gameState.world.currentArea,
    enemy: { ...template, level, maxHp: Math.round(template.hp * scale), hp: Math.round(template.hp * scale), attack: Math.round(template.attack * scale), defense: Math.round(template.defense * scale), exp: enemyExperience(level, template.boss ? "boss" : "normal") },
    log: [template.boss ? `${template.name}, CHEFE DE ${area.name.toLocaleUpperCase("pt-BR")}, aceita seu desafio!` : `${template.name} bloqueia seu caminho!`],
    visualActions: [],
    autoAttack: false
  };
  gameState.player.energy = gameState.player.maxEnergy;
  if (gameState.settings.musicEnabled) gameAudio.startBattle();
  autoSave();
  renderCombat();
}

function renderCombat() {
  const { enemy, log, visualActions } = gameState.combat;
  setScreen("combat", () => {
    terminal.separator("BATALHA");
    terminal.battlefield({
      playerName: gameState.player.name,
      playerHp: gameState.player.hp,
      playerMaxHp: getMaxHp(),
      enemyName: `${enemy.name} Nv.${enemy.level}`,
      enemyHp: enemy.hp,
      enemyMaxHp: enemy.maxHp,
      actions: visualActions
    });
    terminal.print(`Sua energia: ${gameState.player.energy}/${gameState.player.maxEnergy}`);
    terminal.print("");
    log.slice(-4).forEach(message => terminal.print(message));
    addOption(1, "Ataque básico", () => playerAttack());
    addOption(2, "Usar habilidade", renderCombatSkills);
    addOption(3, `Usar poção — ${totalPotionQuantity()} disponível(is)`, renderCombatPotions);
    addOption(4, "Tentar fugir", attemptFlee);
    addOption(5, `Música: ${gameState.settings.musicEnabled ? "LIGADA" : "DESLIGADA"}`, () => { toggleMusic(); renderCombat(); });
    addOption(6, `Auto Attack: ${gameState.combat.autoAttack ? "ON" : "OFF"}`, toggleAutoAttack);
  });
  if (gameState.combat?.autoAttack) {
    autoAttackTimer = window.setTimeout(() => {
      autoAttackTimer = null;
      if (gameState.combat?.autoAttack && gameState.currentScreen === "combat") playerAttack();
    }, getAttackInterval() * 1000);
  }
}

function toggleAutoAttack() {
  gameState.combat.autoAttack = !gameState.combat.autoAttack;
  gameState.combat.log.push(`Auto Attack ${gameState.combat.autoAttack ? "ativado" : "desativado"}.`);
  renderCombat();
}

function playerAttack(skillId = null) {
  const combat = gameState.combat;
  const player = gameState.player;
  const skill = skillId ? SKILLS[skillId] : null;
  if (skill && player.energy < skill.energy) {
    combat.log.push("Energia insuficiente.");
    renderCombat();
    return;
  }
  if (skill) player.energy -= skill.energy;
  else player.energy = Math.min(player.maxEnergy, player.energy + 1);

  const stats = getCombatStats();
  const weaponType = getEquippedWeaponType();
  addMasteryExp(gameState.player.weaponMastery[weaponType], getAttackInterval() * BALANCE.TRAINING_XP_PER_SECOND * BALANCE.COMBAT_MASTERY_EFFICIENCY);
  const hitChance = Math.max(.65, Math.min(.97, .88 + (player.attributes.des - combat.enemy.level) * .008));
  if (Math.random() > hitChance) {
    combat.visualActions = [{ type: "dodge", label: "ERROU →" }];
    combat.log.push(`${combat.enemy.name} evita seu ataque.`);
    enemyTurn();
    return;
  }
  const critChance = 5 + player.attributes.sor + stats.crit + (skill?.critBonus || 0);
  const critical = Math.random() * 100 < critChance;
  const base = Math.max(1, stats.attack - combat.enemy.defense + randomInt(-2, 3));
  const damage = Math.max(1, Math.round(base * (skill?.multiplier || 1) * (critical ? 1.6 : 1)));
  combat.enemy.hp = Math.max(0, combat.enemy.hp - damage);
  combat.visualActions = [{ type: "player", label: `ATQ ${damage} →` }];
  combat.log.push(`${skill ? skill.name : "Seu ataque"} causa ${damage} de dano${critical ? " CRÍTICO" : ""}.`);
  if (combat.enemy.hp <= 0) { winCombat(); return; }
  enemyTurn();
}

function enemyTurn() {
  const { enemy, log } = gameState.combat;
  const stats = getCombatStats();
  const dodgeChance = Math.min(25, gameState.player.attributes.des * 1.25);
  if (Math.random() * 100 < dodgeChance) {
    log.push(`Você evita o ataque de ${enemy.name}.`);
    gameState.combat.visualActions.push({ type: "dodge", label: "← ESQUIVA" });
  }
  else {
    const damage = Math.max(1, enemy.attack - stats.defense + randomInt(-2, 3));
    gameState.player.hp = Math.max(0, gameState.player.hp - damage);
    gameState.combat.visualActions.push({ type: "enemy", label: `← ${damage} DANO` });
    log.push(`${enemy.name} causa ${damage} de dano.`);
  }
  if (gameState.player.hp <= 0) loseCombat();
  else { autoSave(); renderCombat(); }
}

function renderCombatSkills() {
  setScreen("combatSkills", () => {
    terminal.separator("HABILIDADES");
    terminal.print(`Energia: ${gameState.player.energy}/${gameState.player.maxEnergy}`);
    gameState.player.skills.forEach((id, index) => {
      const skill = SKILLS[id];
      addOption(index + 1, `${skill.name} (${skill.energy} EN) — ${skill.description}`, () => playerAttack(id));
    });
    addOption(0, "Voltar", renderCombat);
  });
}

function renderCombatPotions() {
  const potions = gameState.inventory.filter(item => ITEMS[item.itemId].type === "consumable" && ITEMS[item.itemId].heal);
  setScreen("combatPotions", () => {
    terminal.separator("POÇÕES");
    terminal.print(`HP atual: ${gameState.player.hp}/${getMaxHp()}`);
    if (!potions.length) terminal.print("Você não possui poções de cura.", "error");
    potions.forEach((potion, index) => {
      const data = ITEMS[potion.itemId];
      addOption(index + 1, `${data.name} ×${potion.quantity} — recupera ${data.heal} HP`, () => usePotionInCombat(potion.itemId));
    });
    addOption(0, "Voltar à batalha", renderCombat);
  });
}

function usePotionInCombat(itemId) {
  const potion = findStack(itemId);
  const maxHp = getMaxHp();
  if (!potion) gameState.combat.log.push("Você não possui poções.");
  else if (gameState.player.hp >= maxHp) gameState.combat.log.push("Seu HP já está cheio.");
  else {
    removeItem(potion, 1);
    const healed = Math.min(ITEMS[itemId].heal, maxHp - gameState.player.hp);
    gameState.player.hp += healed;
    gameState.combat.log.push(`Você recupera ${healed} HP.`);
    gameState.combat.visualActions = [{ type: "player", label: `+${healed} HP` }];
    enemyTurn();
    return;
  }
  renderCombat();
}

function totalPotionQuantity() {
  return gameState.inventory
    .filter(item => ITEMS[item.itemId].type === "consumable" && ITEMS[item.itemId].heal)
    .reduce((total, item) => total + item.quantity, 0);
}

function attemptFlee() {
  if (Math.random() < .55 + gameState.player.attributes.des * .02) {
    gameAudio.stopMusic();
    gameState.expedition.active = false;
    renderGame("Você foge da criatura e encerra a expedição.");
  } else {
    gameState.combat.log.push("A criatura impede sua fuga.");
    gameState.combat.visualActions = [{ type: "dodge", label: "FUGA FALHOU" }];
    enemyTurn();
  }
}

function winCombat() {
  const { enemy, enemyId, areaId } = gameState.combat;
  gameAudio.stopMusic();
  const coins = randomInt(enemy.coins[0], enemy.coins[1]);
  const awardedExp = Math.round(enemy.exp * levelRewardMultiplier(enemy.level, gameState.player.level));
  gameState.player.coins += coins;
  const drops = [];
  let bossDropMessage = "";
  if (enemy.boss && enemy.setItems) {
    const failures = gameState.world.bossPity[enemyId] || 0;
    const setChance = Math.min(.78, .3 + failures * .12);
    if (Math.random() < setChance) {
      const missing = enemy.setItems.filter(itemId => !gameState.inventory.some(item => item.itemId === itemId));
      const pool = missing.length ? missing : enemy.setItems;
      const setDrop = pool[randomInt(0, pool.length - 1)];
      addItem(setDrop, 1, true);
      drops.push(`${ITEMS[setDrop].name} [PEÇA DE SET]`);
      gameState.world.bossPity[enemyId] = 0;
      bossDropMessage = "O chefe deixou uma peça de seu conjunto.";
    } else {
      gameState.world.bossPity[enemyId] = failures + 1;
      const nextChance = Math.round(Math.min(.78, .3 + (failures + 1) * .12) * 100);
      bossDropMessage = `Nenhuma peça de set desta vez. Próxima chance: ${nextChance}%.`;
    }
  }
  for (const [itemId, chance] of enemy.drops) {
    const data = ITEMS[itemId];
    const adjustedChance = data.type === "equipment" ? chance * .65 : data.type === "consumable" ? Math.min(1, chance * 1.4) : chance;
    if (Math.random() <= adjustedChance) {
      if (addItem(itemId, 1)) drops.push(ITEMS[itemId].name);
      else drops.push(`${ITEMS[itemId].name} [MOCHILA CHEIA — NÃO COLETADO]`);
    }
  }
  const area = AREAS[areaId];
  const bonusPotionChance = enemy.boss ? .7 : .34;
  if (Math.random() < bonusPotionChance) {
    const potionId = area.levels[1] <= 5 ? "pocao_menor" : area.levels[1] <= 12 ? "pocao_maior" : "pocao_suprema";
    if (addItem(potionId, 1)) drops.push(`${ITEMS[potionId].name} [SUPRIMENTO]`);
  }
  const levels = gainExperience(awardedExp);
  if (enemy.boss) {
    gameState.world.regionProgress[areaId] = 0;
    gameState.world.bossesDefeated[enemyId] = (gameState.world.bossesDefeated[enemyId] || 0) + 1;
  } else {
    gameState.world.regionProgress[areaId] = getRegionProgress(areaId) + 1;
  }
  gameState.combat = null;
  autoSave();
  setScreen("victory", () => {
    terminal.separator("VITÓRIA");
    terminal.print(`${enemy.boss ? "CHEFE " : ""}${enemy.name} foi derrotado.`, "success");
    terminal.print(`+${awardedExp} EXP  +${coins} moedas`);
    terminal.print(drops.length ? `Drops: ${drops.join(", ")}` : "Nenhum item encontrado.");
    if (levels) terminal.print(`Você alcançou o nível ${gameState.player.level}! HP restaurado.`, "title");
    const bossReady = getRegionProgress(areaId) >= area.bossKills;
    if (bossDropMessage) terminal.print(bossDropMessage, bossDropMessage.startsWith("Nenhuma") ? "muted" : "success");
    addOption(1, "Continuar expedição", explore);
    if (bossReady && !enemy.boss) addOption("b", `Enfrentar ${ENEMIES[area.boss].name} agora`, () => startCombat(area.boss), "boss-item");
    addOption(0, "Encerrar expedição", () => endExpedition("Expedição encerrada. Seus espólios estão seguros."));
  });
}

function loseCombat() {
  gameAudio.stopMusic();
  const lost = Math.min(gameState.player.coins, Math.ceil(gameState.player.coins * .2));
  gameState.player.coins -= lost;
  gameState.player.hp = Math.max(1, Math.round(getMaxHp() * .4));
  gameState.combat = null;
  gameState.expedition.active = false;
  autoSave();
  setScreen("defeat", () => {
    terminal.separator("DERROTA");
    terminal.print("A escuridão o engole, mas ainda não aceita sua alma.", "error");
    terminal.print(`Você desperta ferido e perdeu ${lost} moedas.`);
    addOption(1, "Levantar", renderGame);
  });
}

function gainExperience(amount) {
  const player = gameState.player;
  player.exp += amount;
  let levels = 0;
  while (player.exp >= player.expToNext) {
    player.exp -= player.expToNext;
    player.level += 1;
    player.expToNext = playerExpRequired(player.level);
    player.attributes.for += 1;
    player.attributes.con += 1;
    player.maxHp = 80 + player.attributes.con * 10;
    player.hp = getMaxHp();
    levels += 1;
    for (const [id, skill] of Object.entries(SKILLS)) {
      if (skill.level <= player.level && !player.skills.includes(id)) player.skills.push(id);
    }
  }
  return levels;
}

function renderTrainingGround(message = "") {
  if (gameState.trainingSession?.active) return renderActiveTraining(message);
  setScreen("trainingGround", () => {
    terminal.separator("CAMPO DE TREINAMENTO");
    terminal.print("Área segura. Treine domínio sem receber drops, moedas ou EXP de personagem.", "muted");
    if (message) terminal.print(message, "error");
    Object.entries(WEAPON_TYPES).forEach(([type, data], index) => {
      const mastery = gameState.player.weaponMastery[type];
      addOption(index + 1, `${data.name} — Domínio ${mastery.level} | ${Math.floor(mastery.exp)}/${masteryExpRequired(mastery.level)} XP`, () => renderWeaponTraining(type));
    });
    addOption(0, "Voltar ao menu", renderGameMenu);
  });
}

function renderWeaponTraining(type) {
  const data = WEAPON_TYPES[type];
  const mastery = gameState.player.weaponMastery[type];
  const required = masteryExpRequired(mastery.level);
  const nextMilestone = MASTERY_MILESTONES.find(level => level > mastery.level);
  setScreen("weaponTraining", () => {
    terminal.separator(`TREINAMENTO • ${data.name.toLocaleUpperCase("pt-BR")}`);
    terminal.print(`Domínio ${mastery.level}  ${bar(mastery.exp, required)}  ${Math.floor(mastery.exp)}/${required} XP`);
    terminal.print(`Bônus de dano: +${(mastery.level * BALANCE.MASTERY_DAMAGE_PER_LEVEL * 100).toFixed(1)}% | Intervalo: ${data.attackInterval.toFixed(2)}s`);
    terminal.print(`Tempo total: ${formatDuration(mastery.totalTrainingTime)}${nextMilestone ? ` | Próximo marco: ${nextMilestone}` : " | Domínio máximo"}`, "muted");
    addOption(1, "Treinar por 1 minuto — até 27 XP", () => startTimedTraining(type, 60));
    addOption(2, "Treinar por 10 minutos — até 270 XP", () => startTimedTraining(type, 600));
    addOption(3, "Treinar por 1 hora — até 1.620 XP", () => startTimedTraining(type, 3600));
    addOption(4, "Iniciar treinamento automático/offline", () => startAutoTraining(type));
    addOption(0, "Escolher outra arma", renderTrainingGround);
  });
}

function startTimedTraining(type, durationSeconds) {
  if (gameState.autoFarmSession?.active) return renderTrainingGround("Encerre o Auto Farm antes de treinar.");
  gameState.trainingSession = { active: true, weaponType: type, startedAt: Date.now(), durationSeconds };
  autoSave();
  renderActiveTraining();
}

function startAutoTraining(type) {
  if (gameState.autoFarmSession?.active) return renderTrainingGround("Encerre o Auto Farm antes de treinar.");
  gameState.trainingSession = { active: true, weaponType: type, startedAt: Date.now() };
  autoSave();
  renderActiveTraining();
}

function renderActiveTraining(message = "") {
  const session = gameState.trainingSession;
  const elapsed = sanitizedElapsedSeconds(session.startedAt);
  const effectiveElapsed = session.durationSeconds ? Math.min(elapsed, session.durationSeconds) : elapsed;
  setScreen("activeTraining", () => {
    terminal.separator("TREINAMENTO EM ANDAMENTO");
    terminal.print(`${WEAPON_TYPES[session.weaponType].name} | Tempo contabilizado agora: ${formatDuration(effectiveElapsed)}`, "success");
    if (session.durationSeconds) terminal.print(`Meta: ${formatDuration(session.durationSeconds)} | Restante: ${formatDuration(Math.max(0, session.durationSeconds - elapsed))}`);
    terminal.print(`Limite por sessão: ${BALANCE.MAX_OFFLINE_SECONDS / 3600} horas. O tempo é calculado por timestamp mesmo com o jogo fechado.`, "muted");
    if (message) terminal.print(message, "error");
    addOption(1, elapsed >= (session.durationSeconds || 0) ? "Concluir treinamento e receber XP" : "Encerrar agora e receber o progresso parcial", resolveTrainingSession);
    addOption(0, "Salvar e sair ao menu principal", saveAndExit);
  });
}

function resolveTrainingSession() {
  const session = gameState.trainingSession;
  if (!session?.active) return renderTrainingGround();
  const elapsed = sanitizedElapsedSeconds(session.startedAt);
  const result = calculateTraining(session.durationSeconds ? Math.min(elapsed, session.durationSeconds) : elapsed);
  const masteryResult = addMasteryExp(gameState.player.weaponMastery[session.weaponType], result.exp, result.seconds);
  const type = session.weaponType;
  gameState.trainingSession = null;
  autoSave();
  renderTrainingResult(type, masteryResult, result.seconds);
}

function renderTrainingResult(type, masteryResult, seconds) {
  const strikes = Math.floor(seconds / WEAPON_TYPES[type].attackInterval);
  setScreen("trainingResult", () => {
    terminal.separator("TREINAMENTO CONCLUÍDO");
    terminal.print(`${WEAPON_TYPES[type].name} | ${formatDuration(seconds)}`, "title");
    terminal.print(`Domínio: ${masteryResult.before} → ${masteryResult.after}`);
    terminal.print(`XP obtida: ${Math.floor(masteryResult.gained).toLocaleString("pt-BR")}`);
    terminal.print(`Bônus atual: +${(masteryResult.after * BALANCE.MASTERY_DAMAGE_PER_LEVEL * 100).toFixed(1)}%`);
    terminal.print(`Aproximadamente ${strikes.toLocaleString("pt-BR")} golpes praticados. A quantidade é apenas visual.`, "muted");
    addOption(1, "Continuar", () => renderWeaponTraining(type));
  });
}

function renderAutoFarm(message = "") {
  if (gameState.autoFarmSession?.active) return renderActiveAutoFarm(message);
  const regionId = gameState.world.currentArea;
  const area = AREAS[regionId];
  const snapshot = createFarmSnapshot();
  const estimate = estimateAutoFarm(regionId, snapshot);
  const averageCoins = area.enemies.reduce((sum, id) => sum + (ENEMIES[id].coins[0] + ENEMIES[id].coins[1]) / 2, 0) / area.enemies.length;
  setScreen("autoFarm", () => {
    terminal.separator("AUTO FARM");
    terminal.print(`${area.name} | Inimigos Nv.${area.levels[0]}–${area.levels[1]} | Seu nível: ${gameState.player.level}`, "title");
    terminal.print(`Eficiência estimada: ${estimate.efficiency}% | Risco: ${estimate.risk}`, estimate.risk === "ALTO" ? "error" : "success");
    terminal.print(`~${(estimate.killsPerHour * estimate.expPerKill).toLocaleString("pt-BR")} XP/h | ~${Math.round(estimate.killsPerHour * averageCoins).toLocaleString("pt-BR")} moedas/h | ~${estimate.killsPerHour} vitórias/h`);
    terminal.print(`Dano médio: ${Math.round(estimate.averageDamage)} | Tempo por combate: ${estimate.killTime.toFixed(1)}s | Dano recebido/ciclo: ~${Math.round(estimate.damagePerKill)}`, "muted");
    if (message) terminal.print(message, "error");
    addOption(1, "Iniciar Auto Farm nesta região", () => startAutoFarm(regionId));
    addOption(2, "Escolher região", renderAutoFarmRegions);
    addOption(3, "Configurar poções e segurança", renderAutoFarmSettings);
    addOption(0, "Voltar ao menu", renderGameMenu);
  });
}

function renderAutoFarmRegions() {
  setScreen("autoFarmRegions", () => {
    terminal.separator("REGIÃO DO AUTO FARM");
    Object.entries(AREAS).forEach(([id, area], index) => {
      const unlocked = gameState.player.level >= area.requiredLevel;
      addOption(index + 1, `${area.name} — Nv.${area.levels[0]}–${area.levels[1]}${unlocked ? "" : ` | bloqueada até Nv.${area.requiredLevel}`}`, () => {
        if (!unlocked) return renderAutoFarmRegions();
        gameState.world.currentArea = id;
        renderAutoFarm();
      });
    });
    addOption(0, "Voltar", renderAutoFarm);
  });
}

function renderAutoFarmSettings() {
  const settings = gameState.autoFarmSettings;
  setScreen("autoFarmSettings", () => {
    terminal.separator("CONFIGURAÇÕES DO AUTO FARM");
    addOption(1, `Auto Potion: ${settings.autoPotion ? "ON" : "OFF"}`, () => { settings.autoPotion = !settings.autoPotion; renderAutoFarmSettings(); });
    addOption(2, `Usar abaixo de: ${Math.round(settings.potionThreshold * 100)}% HP`, () => {
      const thresholds = [.3, .4, .5, .6];
      settings.potionThreshold = thresholds[(thresholds.indexOf(settings.potionThreshold) + 1) % thresholds.length];
      renderAutoFarmSettings();
    });
    addOption(3, `Preservar poções raras: ${settings.preserveRarePotions ? "ON" : "OFF"}`, () => { settings.preserveRarePotions = !settings.preserveRarePotions; renderAutoFarmSettings(); });
    addOption(4, `Parar com inventário cheio: ${settings.stopWhenFull ? "ON" : "OFF"}`, () => { settings.stopWhenFull = !settings.stopWhenFull; renderAutoFarmSettings(); });
    addOption(5, `Parar sem poções e com HP baixo: ${settings.stopWithoutPotions ? "ON" : "OFF"}`, () => { settings.stopWithoutPotions = !settings.stopWithoutPotions; renderAutoFarmSettings(); });
    addOption(0, "Voltar", renderAutoFarm);
  });
}

function startAutoFarm(regionId) {
  if (gameState.trainingSession?.active) return renderAutoFarm("Conclua o treinamento automático antes de iniciar o farm.");
  const area = AREAS[regionId];
  if (!area || gameState.player.level < area.requiredLevel) return renderAutoFarm("Região bloqueada para seu nível.");
  gameState.autoFarmSession = { active: true, regionId, startedAt: Date.now(), playerSnapshot: createFarmSnapshot() };
  autoSave();
  renderActiveAutoFarm();
}

function renderActiveAutoFarm(message = "") {
  const session = gameState.autoFarmSession;
  const elapsed = sanitizedElapsedSeconds(session.startedAt);
  setScreen("activeAutoFarm", () => {
    terminal.separator("AUTO FARM EM ANDAMENTO");
    terminal.print(`${AREAS[session.regionId].name} | Tempo contabilizado: ${formatDuration(elapsed)}`, "success");
    terminal.print("A simulação usa o retrato dos seus atributos no início da sessão e aceita no máximo 8 horas.", "muted");
    if (message) terminal.print(message, "error");
    addOption(1, "Encerrar e gerar relatório", resolveAutoFarmSession);
    addOption(0, "Salvar e sair ao menu principal", saveAndExit);
  });
}

function resolveAutoFarmSession() {
  const session = gameState.autoFarmSession;
  if (!session?.active) return renderAutoFarm();
  const elapsed = sanitizedElapsedSeconds(session.startedAt);
  const result = simulateAutoFarm(session, elapsed);
  const oldLevel = gameState.player.level;
  const weaponType = session.playerSnapshot.weaponType;
  const oldMastery = gameState.player.weaponMastery[weaponType].level;

  for (const [itemId, quantity] of Object.entries(result.drops)) addItem(itemId, quantity);
  for (const [itemId, quantity] of Object.entries(result.potionsUsed)) consumeById(itemId, quantity);
  gameState.player.coins += result.coins;
  gainExperience(result.exp);
  addMasteryExp(gameState.player.weaponMastery[weaponType], result.masterySeconds * BALANCE.TRAINING_XP_PER_SECOND);
  gameState.player.hp = result.died ? Math.max(1, Math.round(getMaxHp() * .4)) : Math.max(1, Math.min(getMaxHp(), Math.round(result.endingHp)));
  gameState.autoFarmSession = null;
  autoSave();
  renderAutoFarmReport(result, session, oldLevel, oldMastery);
}

function renderAutoFarmReport(result, session, oldLevel, oldMastery) {
  setScreen("autoFarmReport", () => {
    terminal.separator(result.died ? "AUTO FARM INTERROMPIDO" : "RELATÓRIO DE EXPEDIÇÃO");
    terminal.print(`${AREAS[session.regionId].name} | ${formatDuration(result.seconds)} | ${result.stoppedReason}`, result.died ? "error" : "success");
    terminal.print(`Inimigos derrotados: ${result.kills.toLocaleString("pt-BR")} | XP: ${result.exp.toLocaleString("pt-BR")} | Moedas: ${result.coins.toLocaleString("pt-BR")}`);
    terminal.print(`Nível: ${oldLevel} → ${gameState.player.level}`);
    terminal.print(`Domínio de ${WEAPON_TYPES[session.playerSnapshot.weaponType].name}: ${oldMastery} → ${gameState.player.weaponMastery[session.playerSnapshot.weaponType].level}`);
    terminal.print(`Drops: ${formatItemMap(result.drops) || "nenhum"}`);
    terminal.print(`Poções utilizadas: ${formatItemMap(result.potionsUsed) || "nenhuma"}`);
    if (result.died) terminal.print("Você foi derrotado e retornou ao último local seguro.", "error");
    addOption(1, "Continuar", renderGame);
  });
}

function createFarmSnapshot() {
  const stats = getCombatStats();
  const potions = Object.fromEntries(gameState.inventory.filter(item => ITEMS[item.itemId].type === "consumable").map(item => [item.itemId, item.quantity]));
  return {
    level: gameState.player.level, hp: gameState.player.hp, maxHp: getMaxHp(),
    attack: stats.attack, defense: stats.defense, crit: stats.crit,
    attributes: { ...gameState.player.attributes }, weaponType: getEquippedWeaponType(), attackInterval: getAttackInterval(),
    potions, occupiedSlots: gameState.inventory.length, bagCapacity: getBagCapacity(),
    existingStacks: Object.fromEntries(gameState.inventory.filter(item => ITEMS[item.itemId].type !== "equipment").map(item => [item.itemId, true])),
    ...gameState.autoFarmSettings
  };
}

function formatItemMap(map) {
  return Object.entries(map).map(([itemId, quantity]) => `${ITEMS[itemId]?.name || itemId} ×${quantity}`).join(", ");
}

function renderAreas() {
  setScreen("areas", () => {
    terminal.separator("REGIÕES");
    Object.entries(AREAS).forEach(([id, area], index) => {
      const unlocked = gameState.player.level >= area.requiredLevel;
      const here = id === gameState.world.currentArea ? " — LOCAL ATUAL" : "";
      const boss = ENEMIES[area.boss];
      addOption(index + 1, `${area.name} — Nv.${area.levels[0]}–${area.levels[1]}${here}${unlocked ? "" : ` — exige Nv.${area.requiredLevel}`}`, () => travelTo(id));
      terminal.print(`    Chefe: ${boss.name} | ${area.description}`, "muted");
    });
    addOption(0, "Voltar", renderGame);
  });
}

function travelTo(areaId) {
  const area = AREAS[areaId];
  if (gameState.player.level < area.requiredLevel) {
    setScreen("lockedArea", () => {
      terminal.separator("CAMINHO BLOQUEADO");
      terminal.print(`${area.name} exige nível ${area.requiredLevel}. Você ainda é nível ${gameState.player.level}.`, "error");
      addOption(0, "Voltar", renderAreas);
    });
    return;
  }
  gameState.world.currentArea = areaId;
  renderGame(`Você chega a ${area.name}. ${area.description}`);
}

function renderStatus() {
  const player = gameState.player;
  setScreen("status", () => {
    terminal.separator("PERSONAGEM");
    terminal.print(`${player.name} — ${player.origin}`, "title");
    terminal.print(`Nível: ${player.level}  EXP: ${player.exp}/${player.expToNext}`);
    terminal.print(`HP: ${player.hp}/${getMaxHp()}  Energia: ${player.energy}/${player.maxEnergy}`);
    printAttributes(player.attributes);
    const stats = getCombatStats();
    terminal.print(`Ataque: ${stats.attack}  Defesa: ${stats.defense}  Crítico extra: ${stats.crit}%`);
    const weaponType = getEquippedWeaponType();
    terminal.print(`Arma ativa: ${WEAPON_TYPES[weaponType].name} | Domínio ${player.weaponMastery[weaponType].level} | Ataque a cada ${getAttackInterval().toFixed(2)}s`);
    const setBonus = getActiveSetBonus();
    terminal.print(setBonus ? `Conjunto completo: ${setBonus.name} — BÔNUS ATIVO` : "Conjunto completo: nenhum", setBonus ? "success" : "muted");
    terminal.print(`Moedas: ${player.coins}`);
    addOption(1, "Ver habilidades", renderSkills);
    addOption(0, "Voltar", renderGame);
  });
}

function renderSkills() {
  setScreen("skills", () => {
    terminal.separator("HABILIDADES");
    for (const [id, skill] of Object.entries(SKILLS)) {
      const unlocked = gameState.player.skills.includes(id);
      terminal.print(`${unlocked ? "◆" : "◇"} ${skill.name} — ${unlocked ? skill.description : `desbloqueia no nível ${skill.level}`}`, unlocked ? "success" : "muted");
    }
    addOption(0, "Voltar", renderStatus);
  });
}

function printAttributes(attributes) {
  terminal.print(`FOR ${attributes.for}  DES ${attributes.des}  CON ${attributes.con}`);
  terminal.print(`INT ${attributes.int}  ESP ${attributes.esp}  SOR ${attributes.sor}`);
}

function renderInventory(message = "") {
  setScreen("inventory", () => {
    terminal.separator("INVENTÁRIO");
    terminal.print(`${gameState.inventory.length} / ${getBagCapacity()} espaços`);
    if (message) terminal.print(message, "success");
    if (!gameState.inventory.length) terminal.print("Seu inventário está vazio.", "muted");
    let optionIndex = 1;
    for (const group of getInventoryGroups()) {
      if (!group.items.length) continue;
      terminal.print(group.label, "category-heading");
      for (const item of group.items) {
        const data = ITEMS[item.itemId];
        const suffix = data.type === "equipment" ? `+${item.level}` : `×${item.quantity}`;
        const equipped = isEquipped(item.uid) ? " • EQUIPADO" : "";
        addOption(optionIndex, `${getItemIdentity(data)}  ${suffix}${equipped}  |  ${formatItemSummary(item)}`, () => renderItem(item.uid), data.bossItem ? "boss-item" : "");
        optionIndex += 1;
      }
    }
    addOption(0, "Voltar", renderGame);
  });
}

function renderItem(uid) {
  const item = gameState.inventory.find(entry => entry.uid === uid);
  if (!item) return renderInventory();
  const data = ITEMS[item.itemId];
  setScreen("item", () => {
    terminal.separator(data.name.toLocaleUpperCase("pt-BR"));
    terminal.print(`Raridade: ${data.rarity.toLocaleUpperCase("pt-BR")}${data.bossItem ? ` — TROFÉU DE ${data.sourceBoss.toLocaleUpperCase("pt-BR")}` : ""}`, data.bossItem ? "success" : "muted");
    terminal.print(data.description);
    if (data.type === "equipment") {
      terminal.print(isEquipped(item.uid) ? "Status: EQUIPADO" : "Status: guardado no inventário", isEquipped(item.uid) ? "success" : "muted");
      terminal.print(formatItemStats(item));
      if (data.slot === "weapon") terminal.print(`Categoria: ${WEAPON_TYPES[data.weaponType].name} | Atributo principal: ${WEAPON_TYPES[data.weaponType].mainAttribute.toLocaleUpperCase("pt-BR")} | Intervalo: ${WEAPON_TYPES[data.weaponType].attackInterval.toFixed(2)}s`, "muted");
      addOption(1, "Equipar", () => equipItem(uid), data.bossItem ? "boss-item" : "");
      addOption(2, "Evoluir", () => renderUpgrade(uid));
    } else if (data.type === "consumable") {
      terminal.print(`Quantidade: ${item.quantity} | Cura: ${data.heal} HP | Seu HP: ${gameState.player.hp}/${getMaxHp()}`);
      addOption(1, `Usar 1 ${data.name} — recuperar até ${data.heal} HP`, () => useConsumable(uid));
    }
    addOption(0, "Voltar", renderInventory);
  });
}

function renderEquipment(message = "") {
  const slots = { weapon: "Arma", armor: "Armadura", helmet: "Elmo", charm: "Amuleto", boots: "Botas" };
  setScreen("equipment", () => {
    terminal.separator("EQUIPAMENTOS");
    if (message) terminal.print(message, "success");
    for (const [slot, label] of Object.entries(slots)) {
      const uid = gameState.player.equipment[slot];
      const item = gameState.inventory.find(entry => entry.uid === uid);
      const data = item && ITEMS[item.itemId];
      addOption(slot, `${label}: ${item ? `${getItemIdentity(data)} +${item.level}  |  ${formatItemStats(item)}` : "vazio — selecione para equipar"}`, () => renderSlotItems(slot), data?.bossItem ? "boss-item" : "");
    }
    const stats = getCombatStats();
    terminal.print(`Ataque total: ${stats.attack} | Defesa total: ${stats.defense}`);
    const setBonus = getActiveSetBonus();
    terminal.print(setBonus ? `◆ ${setBonus.name}: bônus de conjunto ATIVO` : "◇ Equipe as 5 peças do mesmo chefe para ativar um bônus.", setBonus ? "success" : "muted");
    for (const [setId, bonus] of Object.entries(SET_BONUSES)) {
      const count = getEquippedSetCount(setId);
      terminal.print(`${count === 5 ? "◆" : "◇"} ${bonus.name}: ${count}/5 equipadas — ${formatSetBonus(bonus)}`, count === 5 ? "success" : "muted");
    }
    addOption(0, "Voltar", renderGame);
  });
}

function renderSlotItems(slot) {
  const choices = sortItems(gameState.inventory.filter(item => ITEMS[item.itemId].slot === slot));
  setScreen("slotItems", () => {
    terminal.separator("ESCOLHER ITEM");
    if (!choices.length) terminal.print("Nenhum equipamento deste tipo.", "muted");
    choices.forEach((item, index) => {
      const equipped = isEquipped(item.uid) ? " [EQUIPADO AGORA]" : "";
      const data = ITEMS[item.itemId];
      addOption(index + 1, `${getItemIdentity(data)} +${item.level}${equipped}  |  ${formatItemStats(item)}`, () => equipItem(item.uid), data.bossItem ? "boss-item" : "");
    });
    if (gameState.player.equipment[slot]) addOption("x", "Desequipar", () => { gameState.player.equipment[slot] = null; normalizeHp(); renderEquipment("Item desequipado."); });
    addOption(0, "Voltar", renderEquipment);
  });
}

function equipItem(uid) {
  const item = gameState.inventory.find(entry => entry.uid === uid);
  const data = item && ITEMS[item.itemId];
  if (!data?.slot) return renderInventory();
  gameState.player.equipment[data.slot] = uid;
  normalizeHp();
  renderEquipment(`${data.name} equipado.`);
}

function renderUpgradeList() {
  const equipment = sortItems(gameState.inventory.filter(item => ITEMS[item.itemId].type === "equipment"));
  setScreen("upgradeList", () => {
    terminal.separator("EVOLUIR ITEM");
    terminal.print(`Moedas: ${gameState.player.coins} | Essências: ${itemQuantity("essencia")} | Ferro: ${itemQuantity("fragmento_ferro")}`);
    if (!equipment.length) terminal.print("Você ainda não encontrou equipamentos.", "muted");
    equipment.forEach((item, index) => {
      const equipped = isEquipped(item.uid) ? " [EQUIPADO]" : "";
      const data = ITEMS[item.itemId];
      addOption(index + 1, `${getItemIdentity(data)} +${item.level}${equipped}  |  ${formatItemStats(item)}`, () => renderUpgrade(item.uid), data.bossItem ? "boss-item" : "");
    });
    addOption(0, "Voltar", renderGame);
  });
}

function renderUpgrade(uid, message = "") {
  const item = gameState.inventory.find(entry => entry.uid === uid);
  if (!item) return renderUpgradeList();
  const data = ITEMS[item.itemId];
  const cost = upgradeCost(item.level);
  setScreen("upgrade", () => {
    terminal.separator("EVOLUÇÃO");
    terminal.print(`${data.name} +${item.level}${isEquipped(item.uid) ? " [EQUIPADO]" : ""}`, "title");
    terminal.print(`Atributos atuais: ${formatItemStats(item)}`);
    if (message) terminal.print(message, message.includes("sucesso") ? "success" : "error");
    if (item.level >= 5) terminal.print("Este item atingiu o nível máximo.", "success");
    else {
      terminal.print(`Após evoluir: ${formatItemStats(item, item.level + 1)}`, "success");
      terminal.print(`Custo: ${cost.coins} moedas, ${cost.essence} essência(s), ${cost.iron} ferro(s).`);
      terminal.print(`Você possui: ${gameState.player.coins} moedas, ${itemQuantity("essencia")} essência(s), ${itemQuantity("fragmento_ferro")} ferro(s).`, "muted");
      addOption(1, "Fortalecer item", () => upgradeItem(uid));
    }
    addOption(0, "Voltar", renderUpgradeList);
  });
}

function upgradeItem(uid) {
  const item = gameState.inventory.find(entry => entry.uid === uid);
  const cost = upgradeCost(item.level);
  if (gameState.player.coins < cost.coins || itemQuantity("essencia") < cost.essence || itemQuantity("fragmento_ferro") < cost.iron) {
    renderUpgrade(uid, "Recursos insuficientes.");
    return;
  }
  gameState.player.coins -= cost.coins;
  consumeById("essencia", cost.essence);
  consumeById("fragmento_ferro", cost.iron);
  item.level += 1;
  normalizeHp();
  renderUpgrade(uid, "Evolução realizada com sucesso.");
}

function upgradeCost(level) { return { coins: 12 * level, essence: level, iron: Math.ceil(level / 2) }; }

function formatItemStats(item, level = item.level) {
  const data = ITEMS[item.itemId];
  const scale = 1 + (level - 1) * .25;
  const parts = [];
  if (data.attack) parts.push(`ATQ +${Math.round(data.attack * scale)}`);
  if (data.defense) parts.push(`DEF +${Math.round(data.defense * scale)}`);
  if (data.maxHp) parts.push(`HP +${Math.round(data.maxHp * scale)}`);
  if (data.crit) parts.push(`CRIT +${Math.round(data.crit * scale)}%`);
  return parts.join(" | ");
}

function getItemIdentity(data) {
  return data.bossItem ? `◆ ${data.name} — SET ${data.sourceBoss}` : `${data.name} [${data.rarity.toLocaleUpperCase("pt-BR")}]`;
}

function formatItemSummary(item) {
  const data = ITEMS[item.itemId];
  return data.type === "equipment" ? formatItemStats(item) : data.description;
}

function sortItems(items) {
  const rarityOrder = { boss: 0, épico: 1, raro: 2, incomum: 3, comum: 4 };
  return [...items].sort((a, b) => (rarityOrder[ITEMS[a.itemId].rarity] - rarityOrder[ITEMS[b.itemId].rarity]) || ITEMS[a.itemId].name.localeCompare(ITEMS[b.itemId].name, "pt-BR"));
}

function getInventoryGroups() {
  const groups = [
    ["weapon", "Armas"], ["armor", "Armaduras"], ["helmet", "Elmos"],
    ["charm", "Amuletos"], ["boots", "Botas"], ["consumable", "Consumíveis"], ["material", "Materiais"]
  ];
  return groups.map(([key, label]) => ({
    label,
    items: sortItems(gameState.inventory.filter(item => ITEMS[item.itemId].slot === key || (!ITEMS[item.itemId].slot && ITEMS[item.itemId].type === key)))
  }));
}

function isEquipped(uid) { return Object.values(gameState.player.equipment).includes(uid); }

function useConsumable(uid) {
  const item = gameState.inventory.find(entry => entry.uid === uid);
  const data = ITEMS[item.itemId];
  const maxHp = getMaxHp();
  if (gameState.player.hp >= maxHp) return renderInventory("Seu HP já está cheio.");
  const healed = Math.min(data.heal, maxHp - gameState.player.hp);
  gameState.player.hp += healed;
  removeItem(item, 1);
  renderInventory(`Você recuperou ${healed} HP.`);
}

function addItem(itemId, quantity = 1, force = false) {
  const data = ITEMS[itemId];
  if (!data) return false;
  if (data.type !== "equipment") {
    const stack = findStack(itemId);
    if (stack) { stack.quantity += quantity; return true; }
    if (!force && gameState.inventory.length >= getBagCapacity()) return false;
    gameState.inventory.push({ uid: `${Date.now()}_${Math.random().toString(16).slice(2)}`, itemId, quantity });
    return true;
  }
  for (let count = 0; count < quantity; count += 1) {
    if (!force && gameState.inventory.length >= getBagCapacity()) return count > 0;
    gameState.inventory.push({ uid: `${Date.now()}_${Math.random().toString(16).slice(2)}`, itemId, quantity: 1, level: 1 });
  }
  return true;
}

function findStack(itemId) { return gameState.inventory.find(item => item.itemId === itemId && ITEMS[item.itemId]?.type !== "equipment"); }
function itemQuantity(itemId) { return findStack(itemId)?.quantity || 0; }
function consumeById(itemId, quantity) { const item = findStack(itemId); if (item) removeItem(item, quantity); }
function removeItem(item, quantity) {
  item.quantity -= quantity;
  if (item.quantity <= 0) gameState.inventory.splice(gameState.inventory.indexOf(item), 1);
}

function getBagCapacity() {
  const levelBonus = Math.min(20, Math.floor(gameState.player.level / 5) * 5);
  const purchased = Math.min(20, gameState.player.bag?.purchasedSlots || 0);
  return 20 + levelBonus + purchased;
}

function renderBagMenu(message = "") {
  const levelBonus = Math.min(20, Math.floor(gameState.player.level / 5) * 5);
  const purchased = Math.min(20, gameState.player.bag.purchasedSlots);
  const nextPrice = 50 * (purchased / 5 + 1);
  setScreen("bagMenu", () => {
    terminal.separator("MOCHILA");
    terminal.print(`${gameState.inventory.length} / ${getBagCapacity()} espaços ocupados`, gameState.inventory.length >= getBagCapacity() ? "error" : "title");
    terminal.print(`Base: 20 | Bônus de nível: +${levelBonus}/20 | Comprados: +${purchased}/20`, "muted");
    terminal.print("Você recebe +5 espaços nos níveis 5, 10, 15 e 20.");
    if (message) terminal.print(message, message.includes("insuficientes") || message.includes("limite") ? "error" : "success");
    addOption(1, "Vender itens — libera espaço e concede moedas", renderSellList);
    if (purchased < 20) addOption(2, `Comprar +5 espaços — ${nextPrice} moedas`, buyBagSpace);
    else terminal.print("Limite de expansão comprável atingido (+20).", "success");
    addOption(0, "Voltar ao menu", renderGameMenu);
  });
}

function buyBagSpace() {
  const purchased = Math.min(20, gameState.player.bag.purchasedSlots);
  if (purchased >= 20) return renderBagMenu("Você atingiu o limite de expansão.");
  const price = 50 * (purchased / 5 + 1);
  if (gameState.player.coins < price) return renderBagMenu("Moedas insuficientes para expandir a mochila.");
  gameState.player.coins -= price;
  gameState.player.bag.purchasedSlots += 5;
  renderBagMenu("A mochila recebeu +5 espaços.");
}

function renderSellList(message = "") {
  setScreen("sellList", () => {
    terminal.separator("VENDER ITENS");
    terminal.print(`Moedas: ${gameState.player.coins} | Espaço: ${gameState.inventory.length}/${getBagCapacity()}`);
    terminal.print("Cada venda remove uma unidade. Itens equipados devem ser desequipados primeiro.", "muted");
    if (message) terminal.print(message, message.includes("equipado") ? "error" : "success");
    if (!gameState.inventory.length) terminal.print("Não há itens para vender.", "muted");
    sortItems(gameState.inventory).forEach((item, index) => {
      const data = ITEMS[item.itemId];
      const count = data.type === "equipment" ? `+${item.level}` : `×${item.quantity}`;
      const equipped = isEquipped(item.uid) ? " [EQUIPADO]" : "";
      addOption(index + 1, `${getItemIdentity(data)} ${count}${equipped} — vender por ${getSellValue(item)} moedas`, () => sellItem(item.uid), data.bossItem ? "boss-item" : "");
    });
    addOption(0, "Voltar", renderBagMenu);
  });
}

function sellItem(uid) {
  const item = gameState.inventory.find(entry => entry.uid === uid);
  if (!item) return renderSellList();
  if (isEquipped(uid)) return renderSellList("Este item está equipado. Desequipe-o antes de vender.");
  const name = ITEMS[item.itemId].name;
  const value = getSellValue(item);
  gameState.player.coins += value;
  removeItem(item, 1);
  renderSellList(`${name} vendido por ${value} moedas.`);
}

function getSellValue(item) {
  const data = ITEMS[item.itemId];
  const base = { comum: 4, incomum: 10, raro: 22, épico: 45, boss: 80 }[data.rarity] || 3;
  return data.type === "equipment" ? Math.round(base * (1 + (item.level - 1) * .5)) : base;
}

function getCombatStats() {
  const player = gameState.player;
  const weaponType = getEquippedWeaponType();
  const mainAttribute = WEAPON_TYPES[weaponType].mainAttribute;
  const stats = { attack: 4 + player.attributes[mainAttribute] * 2, defense: Math.floor(player.attributes.con / 2), crit: 0 };
  for (const uid of Object.values(player.equipment)) {
    const item = gameState.inventory.find(entry => entry.uid === uid);
    if (!item) continue;
    const data = ITEMS[item.itemId];
    const scale = 1 + (item.level - 1) * .25;
    stats.attack += Math.round((data.attack || 0) * scale);
    stats.defense += Math.round((data.defense || 0) * scale);
    stats.crit += Math.round((data.crit || 0) * scale);
  }
  const setBonus = getActiveSetBonus();
  if (setBonus) {
    stats.attack += setBonus.attack || 0;
    stats.defense += setBonus.defense || 0;
    stats.crit += setBonus.crit || 0;
  }
  stats.attack = Math.round(stats.attack * masteryDamageMultiplier(player.weaponMastery[weaponType]?.level || 1));
  return stats;
}

function getEquippedWeaponType() {
  const uid = gameState.player.equipment.weapon;
  const item = gameState.inventory.find(entry => entry.uid === uid);
  return item && ITEMS[item.itemId].weaponType || "sword";
}

function getAttackInterval() { return WEAPON_TYPES[getEquippedWeaponType()].attackInterval; }

function getMaxHp() {
  let maxHp = gameState.player.maxHp;
  for (const uid of Object.values(gameState.player.equipment)) {
    const item = gameState.inventory.find(entry => entry.uid === uid);
    if (!item) continue;
    const data = ITEMS[item.itemId];
    maxHp += Math.round((data.maxHp || 0) * (1 + (item.level - 1) * .25));
  }
  maxHp += getActiveSetBonus()?.maxHp || 0;
  return maxHp;
}

function getActiveSetBonus() {
  const equippedItems = Object.values(gameState.player.equipment)
    .map(uid => gameState.inventory.find(item => item.uid === uid))
    .filter(Boolean);
  for (const [setId, bonus] of Object.entries(SET_BONUSES)) {
    const slots = new Set(equippedItems.filter(item => ITEMS[item.itemId].setId === setId).map(item => ITEMS[item.itemId].slot));
    if (["weapon", "armor", "helmet", "charm", "boots"].every(slot => slots.has(slot))) return bonus;
  }
  return null;
}

function getEquippedSetCount(setId) {
  return Object.values(gameState.player.equipment)
    .map(uid => gameState.inventory.find(item => item.uid === uid))
    .filter(item => item && ITEMS[item.itemId].setId === setId).length;
}

function formatSetBonus(bonus) {
  return [
    bonus.attack && `ATQ +${bonus.attack}`,
    bonus.defense && `DEF +${bonus.defense}`,
    bonus.crit && `CRIT +${bonus.crit}%`,
    bonus.maxHp && `HP +${bonus.maxHp}`
  ].filter(Boolean).join(" | ");
}

function normalizeHp() { gameState.player.hp = Math.min(gameState.player.hp, getMaxHp()); }

function normalizeEquipmentSlots() {
  for (const [slot, uid] of Object.entries({ ...gameState.player.equipment })) {
    if (!uid) continue;
    const item = gameState.inventory.find(entry => entry.uid === uid);
    const correctSlot = item && ITEMS[item.itemId]?.slot;
    if (!correctSlot) { gameState.player.equipment[slot] = null; continue; }
    if (correctSlot !== slot) {
      gameState.player.equipment[slot] = null;
      if (!gameState.player.equipment[correctSlot]) gameState.player.equipment[correctSlot] = uid;
    }
  }
}

function toggleMusic() {
  gameState.settings.musicEnabled = !gameState.settings.musicEnabled;
  if (gameState.settings.musicEnabled && gameState.combat) gameAudio.startBattle();
  else if (gameState.settings.musicEnabled && gameState.currentScreen === "mainMenu") gameAudio.startMenu();
  else gameAudio.stopMusic();
  terminal.print(`Música ${gameState.settings.musicEnabled ? "ativada" : "desativada"}.`, "success");
}

function renderHelp() {
  terminal.print("Use ↑ e ↓ para escolher uma ação e Enter para confirmar.", "success");
  terminal.print("Os atalhos mostrados dentro dos botões também podem ser pressionados diretamente.", "muted");
}

function saveAndExit() {
  gameState.combat = null;
  gameState.currentScreen = "game";
  saveGame(gameState);
  renderMainMenu("Campanha salva. Até a próxima queda, cavaleiro.");
}

function continueGame() {
  const loaded = loadGame();
  if (!loaded) return renderMainMenu("Nenhuma campanha foi encontrada.");
  gameState = loaded;
  normalizeEquipmentSlots();
  normalizeHp();
  if (gameState.trainingSession?.active) resolveTrainingSession();
  else if (gameState.autoFarmSession?.active) resolveAutoFarmSession();
  else if (gameState.combat) {
    if (gameState.settings.musicEnabled) gameAudio.startBattle();
    gameState.combat.log.push("A batalha foi restaurada pelo autosave.");
    renderCombat();
  } else if (gameState.expedition.active) renderExpeditionEvent("A expedição foi restaurada pelo autosave.");
  else renderGame("A consciência retorna. A caçada continua.");
}

function confirmDeleteSave() {
  if (!hasSave()) { renderGameMenu(); terminal.print("Nenhuma campanha foi encontrada.", "error"); return; }
  setScreen("deleteConfirmation", () => {
    terminal.separator("APAGAR SAVE");
    terminal.print("Esta ação apagará sua campanha salva.", "error");
    addOption(1, "Confirmar exclusão", () => { deleteSave(); gameState = createInitialState(); renderMainMenu("Campanha apagada."); });
    addOption(0, "Cancelar", renderGameMenu);
  });
}

if (new URLSearchParams(window.location.search).has("debug")) {
  window.KnightFallDebug = Object.freeze({
    training(seconds = 3600, weaponType = getEquippedWeaponType()) {
      const safeType = WEAPON_TYPES[weaponType] ? weaponType : "sword";
      gameState.trainingSession = { active: true, weaponType: safeType, startedAt: Date.now() - Math.max(0, Number(seconds)) * 1000 };
      autoSave();
      return `Treinamento de ${safeType} avançado em ${seconds}s. Recarregue ou conclua a sessão.`;
    },
    farm(seconds = 3600, regionId = gameState.world.currentArea) {
      gameState.autoFarmSession = { active: true, regionId, startedAt: Date.now() - Math.max(0, Number(seconds)) * 1000, playerSnapshot: createFarmSnapshot() };
      autoSave();
      return `Auto Farm em ${regionId} avançado em ${seconds}s. Recarregue ou conclua a sessão.`;
    },
    mastery(weaponType = "sword", level = 50) {
      if (!WEAPON_TYPES[weaponType]) throw new Error("Tipo de arma inválido.");
      gameState.player.weaponMastery[weaponType] = { level: clamp(Math.floor(level), 1, BALANCE.MASTERY_MAX_LEVEL), exp: 0, totalTrainingTime: 0 };
      autoSave();
      return gameState.player.weaponMastery[weaponType];
    }
  });
}

renderMainMenu();
