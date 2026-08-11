import { createWeaponMastery, playerExpRequired } from "./progression.js";

const BASE_ATTRIBUTES = Object.freeze({ for: 5, des: 5, con: 5, int: 5, esp: 5, sor: 5 });

export const ORIGINS = Object.freeze({
  1: { id: "mercenario", name: "Mercenário", description: "+2 FOR, +1 CON", bonuses: { for: 2, con: 1 } },
  2: { id: "cacador", name: "Caçador", description: "+2 DES, +1 SOR", bonuses: { des: 2, sor: 1 } },
  3: { id: "erudito", name: "Erudito", description: "+2 INT, +1 ESP", bonuses: { int: 2, esp: 1 } },
  4: { id: "exilado", name: "Exilado", description: "+1 em todos os atributos", bonuses: { for: 1, des: 1, con: 1, int: 1, esp: 1, sor: 1 } }
});

export function createPlayer(name, originKey) {
  const origin = ORIGINS[originKey];
  if (!origin) throw new Error("Origem inválida.");

  const attributes = { ...BASE_ATTRIBUTES };
  for (const [attribute, bonus] of Object.entries(origin.bonuses)) attributes[attribute] += bonus;
  const maxHp = 80 + attributes.con * 10;

  return {
    name: name.trim(), origin: origin.name, originId: origin.id,
    attributes, hp: maxHp, maxHp, level: 1, exp: 0, expToNext: playerExpRequired(1), coins: 10,
    energy: 3, maxEnergy: 3,
    equipment: { weapon: null, armor: null, helmet: null, charm: null, boots: null },
    bag: { purchasedSlots: 0 },
    weaponMastery: createWeaponMastery(),
    skills: ["golpe_poderoso"]
  };
}
