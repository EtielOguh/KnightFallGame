import { GAME_CONFIG, ITEMS, SKILLS } from "./data.js";
import { addMasteryExp, masteryDamageMultiplier } from "./progression.js";

const SKILL_IDS = Object.keys(SKILLS);

export function createSkillProgression() {
  return {
    classId: GAME_CONFIG.skills.classId,
    points: GAME_CONFIG.skills.startingPoints,
    active: entriesFor("active"),
    passive: entriesFor("passive")
  };
}

export function normalizeSkillProgression(raw, legacySkills = []) {
  const result = createSkillProgression();
  if (raw && typeof raw === "object") {
    result.classId = typeof raw.classId === "string" && raw.classId ? raw.classId : result.classId;
    result.points = integer(raw.points, result.points, 0, 1000000);
    for (const definition of Object.values(SKILLS)) {
      const id = skillId(definition);
      const source = raw[definition.kind]?.[id];
      result[definition.kind][id].level = integer(source?.level ?? source, 0, 0, definition.maxLevel);
    }
    return result;
  }
  for (const id of Array.isArray(legacySkills) ? legacySkills : []) {
    if (SKILLS[id]) result[SKILLS[id].kind][id].level = 1;
  }
  return result;
}

export function createPlayerResources(raw = {}) {
  const maximum = GAME_CONFIG.skills.staminaMax;
  return { stamina: finite(raw.stamina, maximum, 0, maximum), maxStamina: maximum };
}

export function getSkillLevel(player, id) {
  const definition = SKILLS[id];
  return definition ? integer(player.skillProgression?.[definition.kind]?.[id]?.level, 0, 0, definition.maxLevel) : 0;
}

export function skillValue(definition, key, level) {
  const values = definition?.effects?.[key] || definition?.[key];
  return Array.isArray(values) ? values[Math.max(0, Math.min(values.length - 1, level - 1))] : values;
}

export function skillResourceCost(definition, level) {
  const costs = definition?.resource?.costs || [];
  return costs[Math.max(0, Math.min(costs.length - 1, level - 1))] || 0;
}

export function skillCooldown(definition, level) {
  const values = definition?.cooldowns || [];
  return values[Math.max(0, Math.min(values.length - 1, level - 1))] || 0;
}

export function canUpgradeSkill(player, id) {
  const definition = SKILLS[id];
  if (!definition) return blocked("unknown_skill", "Habilidade desconhecida.");
  if (player.skillProgression?.classId !== definition.classId) return blocked("wrong_class", "Esta habilidade pertence a outra classe.");
  const level = getSkillLevel(player, id);
  if (level >= definition.maxLevel) return blocked("max_level", "Nível máximo alcançado.");
  if (player.level < definition.requiredPlayerLevel) return blocked("player_level", `Requer nível ${definition.requiredPlayerLevel}.`);
  if (definition.prerequisite && getSkillLevel(player, definition.prerequisite.id) < definition.prerequisite.level) {
    return blocked("prerequisite", `Requer ${SKILLS[definition.prerequisite.id].name} nível ${definition.prerequisite.level}.`);
  }
  const cost = definition.pointCosts[level];
  if (player.skillProgression.points < cost) return blocked("points", `Requer ${cost} ponto${cost === 1 ? "" : "s"}.`);
  return { ok: true, definition, currentLevel: level, nextLevel: level + 1, cost };
}

export function upgradeSkill(player, id) {
  const check = canUpgradeSkill(player, id);
  if (!check.ok) return check;
  player.skillProgression.points -= check.cost;
  player.skillProgression[check.definition.kind][id].level = check.nextLevel;
  return { ok: true, id, level: check.nextLevel, spent: check.cost };
}

export function createSkillRuntime() {
  return { active: null, cooldowns: {}, eventSequence: 0 };
}

export function tickSkillRuntime(player, runtime, dt) {
  for (const id of Object.keys(runtime.cooldowns)) runtime.cooldowns[id] = Math.max(0, runtime.cooldowns[id] - dt);
  const resources = player.resources;
  resources.stamina = Math.min(resources.maxStamina, resources.stamina + GAME_CONFIG.skills.staminaRegenPerSecond * dt);
}

export function canUseSkill(player, id, runtime) {
  const definition = SKILLS[id];
  if (!definition || definition.kind !== "active") return blocked("unknown_skill", "Habilidade ativa desconhecida.");
  const level = getSkillLevel(player, id);
  if (!level) return blocked("locked", "Habilidade bloqueada.");
  if (runtime.active) return blocked("busy", "Outra habilidade está em execução.");
  if ((runtime.cooldowns[id] || 0) > 0) return blocked("cooldown", `Recuperando: ${runtime.cooldowns[id].toFixed(1)}s.`);
  const weaponType = equippedWeaponType(player);
  if (definition.weaponTypes && !definition.weaponTypes.includes(weaponType)) return blocked("weapon", "Arma incompatível.");
  const cost = skillResourceCost(definition, level);
  if (player.resources.stamina < cost) return blocked("resource", "Vigor insuficiente.");
  return { ok: true, definition, level, cost, cooldown: skillCooldown(definition, level) };
}

export function beginSkill(player, id, runtime, direction) {
  const check = canUseSkill(player, id, runtime);
  if (!check.ok) return check;
  player.resources.stamina -= check.cost;
  runtime.cooldowns[id] = check.cooldown;
  runtime.eventSequence += 1;
  runtime.active = {
    id, level: check.level, elapsed: 0, phase: "anticipation", hitTargets: new Set(),
    direction: normalizeDirection(direction), distanceMoved: 0,
    eventId: `skill_${runtime.eventSequence}`
  };
  return { ok: true, ...check, active: runtime.active };
}

export function cancelSkill(runtime) {
  if (!runtime.active || runtime.active.phase !== "anticipation") return false;
  runtime.active = null;
  return true;
}

export function skillPhaseAt(definition, elapsed) {
  if (elapsed < definition.phases.anticipation) return "anticipation";
  if (elapsed < definition.phases.anticipation + definition.phases.active) return "active";
  if (elapsed < skillDuration(definition)) return "recovery";
  return "complete";
}

export function skillDuration(definition) {
  return definition.phases.anticipation + definition.phases.active + definition.phases.recovery;
}

export function skillTargetHit(active, definition, origin, target, targetRadius = 0) {
  const dx = target.x - origin.x; const dy = target.y - origin.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const dot = dx / distance * active.direction.x + dy / distance * active.direction.y;
  if (active.id === "corte_giratorio") return distance <= definition.effects.radius + targetRadius;
  if (active.id === "investida") return distance <= definition.effects.hitRadius + targetRadius;
  return distance <= definition.effects.range + targetRadius && dot >= definition.effects.arcDot;
}

export function getPassiveStatModifiers(player) {
  const level = getSkillLevel(player, "resistencia");
  const definition = SKILLS.resistencia;
  return { maxHp: level * definition.effects.maxHpPerLevel, armor: level * definition.effects.armorPerLevel };
}

export function outgoingDamageMultiplier(player) {
  const mastery = player.weaponMastery?.[equippedWeaponType(player)]?.level || 1;
  let multiplier = masteryDamageMultiplier(mastery);
  const martialLevel = getSkillLevel(player, "treinamento_marcial");
  const martial = SKILLS.treinamento_marcial;
  if (martialLevel && martial.weaponTypes.includes(equippedWeaponType(player))) multiplier *= 1 + skillValue(martial, "damageBonuses", martialLevel);
  return multiplier;
}

export function equippedWeaponType(player) {
  const uid = player.equipment?.weapon;
  const entry = player.inventory?.find(item => item.uid === uid);
  return ITEMS[entry?.definitionId]?.visual?.kind || ITEMS[entry?.definitionId]?.weaponType || "unarmed";
}

export function createMasteryTracker() {
  return { events: new Set(), targets: new Map() };
}

export function awardMasteryForHit(player, tracker, event) {
  if (!event?.eventId || tracker.events.has(event.eventId) || !(event.damage > 0) || !event.targetId || !event.encounterId) {
    return { gained: 0, code: "ineligible" };
  }
  const weaponType = equippedWeaponType(player);
  if (!player.weaponMastery?.[weaponType]) return { gained: 0, code: "unsupported_weapon" };
  const targetKey = `${event.encounterId}:${event.targetId}:${weaponType}`;
  const earned = tracker.targets.get(targetKey) || 0;
  if (earned >= GAME_CONFIG.skills.masteryTargetCap) return { gained: 0, code: "target_cap" };
  const fraction = Math.min(1, event.damage / Math.max(1, event.targetMaxHp || event.damage));
  const proposed = Math.max(1, Math.round(GAME_CONFIG.skills.masteryExpPerHit + fraction * GAME_CONFIG.skills.masteryExpDamageScale));
  const gained = Math.min(proposed, GAME_CONFIG.skills.masteryTargetCap - earned);
  tracker.events.add(event.eventId);
  if (tracker.events.size > GAME_CONFIG.skills.masteryEventCache) tracker.events.delete(tracker.events.values().next().value);
  tracker.targets.set(targetKey, earned + gained);
  const result = addMasteryExp(player.weaponMastery[weaponType], gained);
  return { ...result, code: "granted", weaponType };
}

function entriesFor(kind) {
  return Object.fromEntries(SKILL_IDS.filter(id => SKILLS[id].kind === kind).map(id => [id, { level: 0 }]));
}

function skillId(definition) { return SKILL_IDS.find(id => SKILLS[id] === definition); }
function blocked(code, reason) { return { ok: false, code, reason }; }
function normalizeDirection(value = {}) {
  const x = finite(value.x, 0, -1, 1); const y = finite(value.y, 1, -1, 1);
  const length = Math.max(1, Math.hypot(x, y));
  return { x: x / length, y: y / length };
}
function integer(value, fallback, min, max) {
  const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}
function finite(value, fallback, min = -Infinity, max = Infinity) {
  const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
