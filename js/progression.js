import { GAME_CONFIG } from "./data.js";

const BALANCE = Object.freeze({
  MASTERY_MAX_LEVEL: 100,
  MASTERY_DAMAGE_PER_LEVEL: 0.012,
  PLAYER_XP_BASE: GAME_CONFIG.progression.xpBase,
  PLAYER_XP_MULTIPLIER: GAME_CONFIG.progression.xpMultiplier
});

const WEAPON_TYPES = Object.freeze({
  sword: { name: "Espada", attackInterval: 1.15, mainAttribute: "for" },
  axe: { name: "Machado", attackInterval: 1.55, mainAttribute: "for" },
  spear: { name: "Lança", attackInterval: 1.3, mainAttribute: "for" },
  bow: { name: "Arco", attackInterval: 1.35, mainAttribute: "des" },
  staff: { name: "Cajado", attackInterval: 1.5, mainAttribute: "int" },
  dagger: { name: "Adaga", attackInterval: 0.8, mainAttribute: "des" }
});

export function createWeaponMastery() {
  return Object.fromEntries(Object.keys(WEAPON_TYPES).map(type => [type, { level: 1, exp: 0 }]));
}

export function masteryExpRequired(level) { return Math.round(250 * Math.pow(level, 1.55)); }
export function playerExpRequired(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  return Math.round(BALANCE.PLAYER_XP_BASE * Math.pow(BALANCE.PLAYER_XP_MULTIPLIER, safeLevel - 1));
}
export function masteryDamageMultiplier(level) { return 1 + level * BALANCE.MASTERY_DAMAGE_PER_LEVEL; }

export function grantPlayerExperience(player, amount) {
  const gained = Math.max(0, Number(amount) || 0);
  player.xp = Math.max(0, Number(player.xp) || 0) + gained;
  let levels = 0;
  while (player.xp >= playerExpRequired(player.level)) {
    player.xp -= playerExpRequired(player.level);
    player.level += 1;
    player.baseStats.maxHp += GAME_CONFIG.progression.hpPerLevel;
    player.baseStats.attack += GAME_CONFIG.progression.attackPerLevel;
    player.attributes.for += 1;
    player.attributes.con += 1;
    if (player.skillProgression && player.level >= GAME_CONFIG.progression.firstSkillPointLevel
      && (player.level - GAME_CONFIG.progression.firstSkillPointLevel) % GAME_CONFIG.progression.skillPointEveryLevels === 0) {
      player.skillProgression.points += GAME_CONFIG.progression.skillPointsPerGrant;
    }
    levels += 1;
  }
  return { gained, levels, level: player.level, xp: player.xp, xpToNext: playerExpRequired(player.level) };
}

export function addMasteryExp(mastery, amount) {
  const before = mastery.level;
  mastery.exp += Math.max(0, amount);
  while (mastery.level < BALANCE.MASTERY_MAX_LEVEL && mastery.exp >= masteryExpRequired(mastery.level)) {
    mastery.exp -= masteryExpRequired(mastery.level);
    mastery.level += 1;
  }
  if (mastery.level >= BALANCE.MASTERY_MAX_LEVEL) mastery.exp = 0;
  return { before, after: mastery.level, gained: amount };
}
