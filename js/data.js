export const AREAS = Object.freeze({
  ruinas_despertar: {
    name: "Ruínas do Despertar", requiredLevel: 1, levels: [1, 2], boss: "guardiao_ruinas", bossKills: 4,
    description: "Colunas quebradas e corredores úmidos escondem criaturas famintas.",
    enemies: ["rato_abissal", "esqueleto", "saqueador_ruinas"]
  },
  cavernas_sussurro: {
    name: "Cavernas do Sussurro", requiredLevel: 3, levels: [3, 5], boss: "matriarca_aracnidea", bossKills: 5,
    description: "Túneis estreitos descem para uma escuridão que parece respirar.",
    enemies: ["morcego_cinzento", "aranha_caverna", "verme_rochoso", "saqueador"]
  },
  bosque_cinzas: {
    name: "Bosque das Cinzas", requiredLevel: 6, levels: [6, 8], boss: "cervo_putrido", bossKills: 6,
    description: "Árvores mortas rangem mesmo quando não há vento.",
    enemies: ["corvo_carniceiro", "lobo_sombrio", "cultista", "ente_cinzas"]
  },
  montanhas_lamento: {
    name: "Montanhas do Lamento", requiredLevel: 9, levels: [9, 12], boss: "dragao_lamento", bossKills: 7,
    description: "O ar rarefeito carrega os gritos de feras antigas.",
    enemies: ["harpia", "golem_pedra", "gigante_gelo", "draco_jovem"]
  },
  catacumbas_esquecidas: {
    name: "Catacumbas Esquecidas", requiredLevel: 13, levels: [13, 16], boss: "necromante_ossos", bossKills: 8,
    description: "Milhares de nichos funerários descem até salões onde os mortos ainda obedecem.",
    enemies: ["carcereiro_morto", "espectro_acorrentado", "cavaleiro_ossada", "abominacao_costurada"]
  },
  fortaleza_eclipse: {
    name: "Fortaleza do Eclipse", requiredLevel: 17, levels: [17, 20], boss: "rei_caido", bossKills: 9,
    description: "Uma cidadela suspensa sob um eclipse eterno, defendida pelo último exército real.",
    enemies: ["sentinela_eclipse", "mago_real", "carrasco_negro", "quimera_real"]
  }
});

export const ENEMIES = Object.freeze({
  rato_abissal: mob("Rato Abissal", 24, 6, 1, 16, [2, 4], [["fragmento_ferro", .3]]),
  esqueleto: mob("Esqueleto Errante", 32, 8, 2, 21, [3, 6], [["espada_gasta", .12], ["fragmento_ferro", .5]]),
  saqueador_ruinas: mob("Saqueador das Ruínas", 40, 9, 2, 27, [4, 7], [["machado_lascado", .13], ["lanca_vigia", .08], ["pocao_menor", .24]]),
  morcego_cinzento: mob("Morcego Cinzento", 44, 11, 2, 31, [5, 8], [["pocao_menor", .25], ["essencia", .35]]),
  aranha_caverna: mob("Aranha da Caverna", 52, 12, 3, 38, [5, 9], [["couro_rustico", .14], ["essencia", .45]]),
  verme_rochoso: mob("Verme Rochoso", 60, 13, 4, 43, [6, 10], [["escudo_ferro", .1], ["fragmento_ferro", .7]]),
  saqueador: mob("Saqueador Perdido", 68, 14, 4, 49, [7, 12], [["adaga_ossada", .14], ["arco_caverna", .12], ["pocao_menor", .3]]),
  corvo_carniceiro: mob("Corvo Carniceiro", 76, 16, 4, 57, [8, 13], [["anel_agilidade", .1], ["essencia", .55]]),
  lobo_sombrio: mob("Lobo Sombrio", 86, 18, 5, 66, [9, 15], [["amuleto_presa", .13], ["essencia", .7]]),
  cultista: mob("Cultista do Vazio", 96, 20, 6, 76, [11, 18], [["cajado_oculto", .12], ["manto_cinza", .14], ["essencia", .75]]),
  ente_cinzas: mob("Ente das Cinzas", 112, 21, 8, 88, [12, 20], [["armadura_casca", .12], ["fragmento_ferro", .8]]),
  harpia: mob("Harpia do Lamento", 120, 23, 7, 96, [15, 23], [["manto_cinza", .16], ["essencia", .8]]),
  golem_pedra: mob("Golem de Pedra", 150, 25, 11, 118, [17, 27], [["peitoral_pedra", .13], ["fragmento_ferro", 1]]),
  gigante_gelo: mob("Gigante de Gelo", 165, 27, 10, 132, [19, 30], [["martelo_gelo", .11], ["pocao_maior", .3], ["essencia", 1]]),
  draco_jovem: mob("Draco Jovem", 180, 29, 9, 150, [22, 34], [["lamina_draconica", .1], ["essencia", 1]]),
  carcereiro_morto: mob("Carcereiro Morto", 205, 32, 12, 175, [25, 38], [["maca_catacumba", .09], ["essencia", 1]]),
  espectro_acorrentado: mob("Espectro Acorrentado", 220, 34, 11, 190, [27, 41], [["anel_espectral", .08], ["pocao_maior", .3]]),
  cavaleiro_ossada: mob("Cavaleiro de Ossada", 245, 36, 14, 215, [30, 45], [["placas_ossada", .08], ["fragmento_ferro", 1]]),
  abominacao_costurada: mob("Abominação Costurada", 275, 38, 13, 240, [34, 50], [["pocao_suprema", .22], ["essencia", 1]]),
  sentinela_eclipse: mob("Sentinela do Eclipse", 295, 41, 15, 265, [38, 55], [["espada_eclipse", .07], ["essencia", 1]]),
  mago_real: mob("Mago Real Corrompido", 280, 45, 13, 285, [40, 58], [["cetro_real", .07], ["pocao_suprema", .25]]),
  carrasco_negro: mob("Carrasco Negro", 330, 46, 17, 310, [44, 62], [["armadura_carrasco", .07], ["fragmento_ferro", 1]]),
  quimera_real: mob("Quimera Real", 360, 49, 16, 345, [48, 70], [["olho_quimera", .07], ["essencia", 1]]),

  guardiao_ruinas: boss("Guardião Sem Rosto", 2, 105, 13, 4, 90, [25, 35], ["espada_guardiao", "armadura_guardiao", "elmo_guardiao", "amuleto_guardiao", "botas_guardiao"], [["essencia", 1], ["fragmento_ferro", 1]]),
  matriarca_aracnidea: boss("Matriarca Aracnídea", 5, 190, 22, 7, 180, [45, 60], ["arco_matriarca", "armadura_matriarca", "elmo_matriarca", "amuleto_matriarca", "botas_matriarca"], [["pocao_maior", 1], ["essencia", 1]]),
  cervo_putrido: boss("Cervo-Rei Putrificado", 8, 285, 30, 10, 300, [75, 95], ["arma_cervo", "armadura_cervo", "coroa_cervo", "amuleto_cervo", "botas_cervo"], [["essencia", 1], ["essencia", 1]]),
  dragao_lamento: boss("Dragão do Lamento", 12, 430, 40, 14, 520, [130, 170], ["montante_lamento", "armadura_lamento", "elmo_lamento", "amuleto_lamento", "botas_lamento"], [["pocao_maior", 1], ["essencia", 1], ["fragmento_ferro", 1]]),
  necromante_ossos: boss("Necromante dos Ossos", 16, 620, 52, 19, 760, [190, 240], ["foice_necromante", "armadura_necromante", "elmo_necromante", "amuleto_necromante", "botas_necromante"], [["pocao_suprema", 1], ["essencia", 1], ["essencia", 1]]),
  rei_caido: boss("Rei Caído do Eclipse", 20, 850, 63, 24, 1100, [280, 350], ["espada_rei", "armadura_rei", "elmo_rei", "amuleto_rei", "botas_rei"], [["pocao_suprema", 1], ["essencia", 1], ["fragmento_ferro", 1]])
});

function mob(name, hp, attack, defense, exp, coins, drops) { return { name, hp, attack, defense, exp, coins, drops, boss: false }; }
function boss(name, level, hp, attack, defense, exp, coins, setItems, drops) { return { name, level, hp, attack, defense, exp, coins, drops, setItems, boss: true }; }

export const RARITIES = deepFreeze({
  comum: { label: "Comum", color: "#aeb2a5", rank: 1 },
  incomum: { label: "Incomum", color: "#75ae68", rank: 2 },
  raro: { label: "Raro", color: "#5e9fbd", rank: 3 },
  épico: { label: "Épico", color: "#a77bd1", rank: 4 },
  lendário: { label: "Lendário", color: "#dfaa45", rank: 5 }
});

export const EQUIPMENT_SLOTS = deepFreeze({
  weapon: { label: "Arma", icon: "sword" },
  helmet: { label: "Capacete", icon: "helmet" },
  chest: { label: "Peitoral", icon: "chest" },
  boots: { label: "Botas", icon: "boots" },
  ring: { label: "Anel", icon: "ring" },
  amulet: { label: "Amuleto", icon: "amulet" }
});

export const ITEMS = defineItems({
  espada_enferrujada: equipment("Espada Enferrujada", "weapon", "comum", 1, { attack: 2 }, 5, "Uma lâmina marcada pelo tempo, ainda confiável.", { kind: "sword", style: "rusty", metal: "#9a7654" }),
  espada_curta: { ...equipment("Espada Curta", "weapon", "incomum", 1, { attack: 4, crit: 1 }, 11, "Rápida, equilibrada e feita para túneis apertados.", { kind: "sword", style: "short", metal: "#bcc5c3" }), buyPrice: 72 },
  espada_ferro: equipment("Espada de Ferro", "weapon", "raro", 2, { attack: 7 }, 22, "Ferro bem trabalhado, com guarda reforçada.", { kind: "sword", style: "iron", metal: "#dce5e2" }),
  armadura_couro: equipment("Armadura de Couro", "chest", "comum", 1, { armor: 3, maxHp: 6 }, 9, "Couro endurecido com tiras sobrepostas.", { kind: "chest", style: "leather", primary: "#8b5638", accent: "#c48a55" }),
  capacete_ferro: { ...equipment("Capacete de Ferro", "helmet", "incomum", 1, { armor: 2 }, 12, "Protege a testa e as têmporas sem limitar a visão.", { kind: "helmet", style: "iron", primary: "#98a5a5", accent: "#d6dfdc" }), buyPrice: 65 },
  botas_couro: { ...equipment("Botas de Couro", "boots", "comum", 1, { armor: 1, moveSpeed: 3 }, 7, "Botas leves com solado firme para pedra úmida.", { kind: "boots", style: "leather", primary: "#68422e", accent: "#a56d45" }), buyPrice: 55 },
  anel_vitalidade: equipment("Anel de Vitalidade", "ring", "raro", 2, { maxHp: 18 }, 20, "Uma pedra rubra aquece quando o perigo se aproxima.", { kind: "ring", style: "vitality", primary: "#d7b45f", accent: "#c6534b" }),
  amuleto_vigia: equipment("Amuleto do Vigia", "amulet", "incomum", 1, { crit: 3, maxHp: 5 }, 14, "Olho de pedra usado pelos antigos sentinelas.", { kind: "amulet", style: "watcher", primary: "#c3a75d", accent: "#6ea18a" }),
  coroa_rei_goblin: equipment("Coroa do Rei Goblin", "helmet", "lendário", 4, { armor: 4, maxHp: 15, crit: 2 }, 85, "Uma coroa brutal de ferro e ouro, tomada do primeiro rei da caverna.", { kind: "helmet", style: "goblin_crown", primary: "#b18a3f", accent: "#f0cf6a" }),
  espada_cinzas: equipment("Lâmina das Cinzas", "weapon", "raro", 5, { attack: 10, crit: 2 }, 38, "Aço escurecido temperado na seiva ardente do bosque.", { kind: "sword", style: "ash", metal: "#b9afa0" }),

  espada_gasta: weapon("Espada Gasta", "comum", 4, "Uma lâmina antiga, ainda afiada."),
  machado_lascado: weapon("Machado Lascado", "comum", 5, "Pesado, direto e confiável.", "axe"),
  lanca_vigia: weapon("Lança do Vigia", "comum", 5, "Mantém a ameaça à distância.", "spear"),
  adaga_ossada: { ...weapon("Adaga de Osso", "incomum", 6, "Leve e cruel.", "dagger"), crit: 3 },
  arco_caverna: { ...weapon("Arco da Caverna", "incomum", 7, "Dispara antes que a escuridão reaja.", "bow"), crit: 2 },
  cajado_oculto: { ...weapon("Cajado Oculto", "raro", 9, "Pulsa com energia contida.", "staff"), spirit: 2 },
  martelo_gelo: weapon("Martelo Glacial", "raro", 12, "O impacto entorpece os ossos.", "axe"),
  lamina_draconica: { ...weapon("Lâmina Dracônica", "épico", 15, "Forjada em escamas escuras."), crit: 3 },
  espada_guardiao: bossGear("Lâmina do Sem Rosto", "weapon", "guardiao", { attack: 11 }, "A arma do Guardião das Ruínas.", "sword"),
  armadura_guardiao: bossGear("Couraça Sem Rosto", "armor", "guardiao", { defense: 7, maxHp: 18 }, "Metal sem qualquer reflexo."),
  elmo_guardiao: bossGear("Elmo Sem Rosto", "helmet", "guardiao", { defense: 4, maxHp: 8 }, "Não possui abertura para os olhos."),
  amuleto_guardiao: bossGear("Selo das Ruínas", "charm", "guardiao", { attack: 3, crit: 3 }, "O selo partido do guardião."),
  botas_guardiao: bossGear("Passos do Guardião", "boots", "guardiao", { defense: 3, maxHp: 6 }, "Botas que não produzem som."),
  arco_matriarca: bossGear("Arco da Matriarca", "weapon", "matriarca", { attack: 16, crit: 8 }, "Tecido com seda da rainha das cavernas.", "bow"),
  armadura_matriarca: bossGear("Carapaça da Matriarca", "armor", "matriarca", { defense: 10, maxHp: 24 }, "Placas quitinosas sobrepostas."),
  elmo_matriarca: bossGear("Olhos da Matriarca", "helmet", "matriarca", { defense: 5, crit: 4 }, "Enxerga movimento na escuridão."),
  amuleto_matriarca: bossGear("Glândula de Veneno", "charm", "matriarca", { attack: 5, crit: 5 }, "Ainda pulsa lentamente."),
  botas_matriarca: bossGear("Patas de Seda", "boots", "matriarca", { defense: 4, crit: 4 }, "Permitem passos rápidos e silenciosos."),
  arma_cervo: bossGear("Galhada do Rei", "weapon", "cervo", { attack: 23 }, "Uma galhada convertida em arma ritual.", "spear"),
  armadura_cervo: bossGear("Pele do Cervo-Rei", "armor", "cervo", { defense: 14, maxHp: 35 }, "Pele tomada por raízes antigas."),
  coroa_cervo: {
    ...bossGear("Coroa do Cervo-Rei", "helmet", "cervo", { defense: 7, maxHp: 16 }, "Símbolo do soberano do bosque."),
    requiredLevel: 5,
    visual: { kind: "helmet", style: "antler_crown", primary: "#d9c79d", accent: "#9f603b" }
  },
  amuleto_cervo: bossGear("Coração Putrificado", "charm", "cervo", { attack: 7, crit: 7 }, "Continua batendo fora do corpo."),
  botas_cervo: bossGear("Cascos do Bosque", "boots", "cervo", { defense: 6, maxHp: 12 }, "Raízes se afastam de seus passos."),
  montante_lamento: bossGear("Montante do Lamento", "weapon", "lamento", { attack: 30, maxHp: 25 }, "Ainda guarda o rugido do dragão.", "sword"),
  armadura_lamento: bossGear("Escamas do Lamento", "armor", "lamento", { defense: 20, maxHp: 50 }, "Escamas que resistiram a incontáveis quedas."),
  elmo_lamento: bossGear("Crânio do Lamento", "helmet", "lamento", { defense: 10, attack: 5 }, "Moldado à imagem do dragão."),
  amuleto_lamento: bossGear("Brasa do Lamento", "charm", "lamento", { attack: 10, crit: 10 }, "Uma chama que jamais se apaga."),
  botas_lamento: bossGear("Garras do Lamento", "boots", "lamento", { defense: 8, attack: 4 }, "Agarram até a pedra nua."),
  foice_necromante: bossGear("Foice das Mil Almas", "weapon", "necromante", { attack: 38, crit: 8 }, "Cada golpe liberta um sussurro aprisionado.", "spear"),
  armadura_necromante: bossGear("Mortalha de Ossos", "armor", "necromante", { defense: 25, maxHp: 65 }, "Ossos unidos por magia funerária."),
  elmo_necromante: bossGear("Crânio do Necromante", "helmet", "necromante", { defense: 12, attack: 6 }, "Olhos vazios observam do interior."),
  amuleto_necromante: bossGear("Filactério Rachado", "charm", "necromante", { attack: 12, crit: 12 }, "Uma fração de alma permanece presa."),
  botas_necromante: bossGear("Passos Funerários", "boots", "necromante", { defense: 10, maxHp: 20 }, "A terra apodrece sob seus passos."),
  espada_rei: bossGear("Regicida do Eclipse", "weapon", "rei", { attack: 48, crit: 10 }, "A lâmina que derrubou e coroou o mesmo rei.", "sword"),
  armadura_rei: bossGear("Armadura do Último Rei", "armor", "rei", { defense: 32, maxHp: 90 }, "Uma relíquia do reino consumido."),
  elmo_rei: bossGear("Coroa do Eclipse", "helmet", "rei", { defense: 16, attack: 8 }, "O eclipse acompanha quem a veste."),
  amuleto_rei: bossGear("Coração da Coroa", "charm", "rei", { attack: 15, crit: 15 }, "O juramento final da linhagem real."),
  botas_rei: bossGear("Marcha do Rei Caído", "boots", "rei", { defense: 13, attack: 6 }, "Cada passo soa como uma ordem."),

  couro_rustico: armor("Armadura de Couro", "comum", 3, 8, "Proteção leve remendada."),
  manto_cinza: armor("Manto Cinzento", "incomum", 5, 12, "Tecido marcado por cinzas."),
  armadura_casca: { ...armor("Armadura de Casca", "raro", 7, 18, "Madeira morta que se recusa a quebrar."), requiredLevel: 5, visual: { kind: "chest", style: "bark", primary: "#574536", accent: "#8d7752" } },
  peitoral_pedra: armor("Peitoral de Pedra", "épico", 10, 24, "Pesado como a montanha."),
  escudo_ferro: { ...armor("Broquel de Ferro", "incomum", 4, 5, "Pequeno escudo preso ao antebraço."), slot: "charm" },
  amuleto_presa: charm("Amuleto de Presa", "incomum", 2, 5, "Aumenta o instinto assassino."),
  anel_agilidade: { ...charm("Anel do Corvo", "raro", 3, 7, "Torna cada movimento mais preciso."), slot: "ring" },
  maca_catacumba: weapon("Maça de Catacumba", "raro", 19, "Feita para romper ossos e armaduras.", "axe"),
  placas_ossada: armor("Placas de Ossada", "épico", 15, 34, "Proteção montada com restos de cavaleiros."),
  anel_espectral: { ...charm("Anel Espectral", "épico", 8, 10, "Torna a mão quase translúcida."), slot: "ring" },
  espada_eclipse: weapon("Espada do Eclipse", "épico", 28, "Sua lâmina alterna entre luz e sombra."),
  cetro_real: weapon("Cetro Real Corrompido", "épico", 30, "Símbolo de autoridade transformado em arma.", "staff"),
  armadura_carrasco: armor("Armadura do Carrasco", "épico", 22, 48, "Placas negras cobertas por sentenças."),
  olho_quimera: charm("Olho da Quimera", "épico", 12, 13, "Continua seguindo seus inimigos."),

  pocao_menor: { name: "Poção Menor", type: "consumable", rarity: "comum", heal: 45, description: "Recupera 45 HP." },
  pocao_maior: { name: "Poção Maior", type: "consumable", rarity: "raro", heal: 90, description: "Recupera 90 HP." },
  pocao_suprema: { name: "Poção Suprema", type: "consumable", rarity: "épico", heal: 170, description: "Recupera 170 HP." },
  fragmento_ferro: { name: "Minério de Ferro", type: "material", rarity: "comum", sellValue: 2, description: "Minério bruto usado nos primeiros reforços.", visual: { kind: "material", style: "iron_ore", primary: "#68706b", accent: "#b5bbb2" } },
  fragmento_aco: { name: "Fragmento de Aço", type: "material", rarity: "incomum", sellValue: 5, description: "Aço goblin recuperado de armas e couraças.", visual: { kind: "material", style: "steel", primary: "#9ba8aa", accent: "#e0e7e3" } },
  essencia: { name: "Essência Goblin", type: "material", rarity: "raro", sellValue: 8, description: "Energia verde condensada, necessária para reforços avançados.", visual: { kind: "material", style: "goblin_essence", primary: "#6e9b48", accent: "#c1de72" } },
  cristal_raro: { name: "Cristal Raro", type: "material", rarity: "épico", sellValue: 18, description: "Cristal da coroa usado nos reforços finais.", visual: { kind: "material", style: "rare_crystal", primary: "#8971bb", accent: "#e0c7ff" } },
  seiva_corrompida: { name: "Seiva Corrompida", type: "material", rarity: "incomum", sellValue: 7, description: "Seiva espessa usada para estabilizar reforços elevados.", visual: { kind: "material", style: "ash_sap", primary: "#79513e", accent: "#d28b55" } },
  cinza_viva: { name: "Cinza Viva", type: "material", rarity: "raro", sellValue: 12, description: "Cinza que conserva calor e fortalece ligas avançadas.", visual: { kind: "material", style: "living_ash", primary: "#696765", accent: "#e18b52" } }
});

function weapon(name, rarity, attack, description, weaponType = "sword") { return { name, type: "equipment", slot: "weapon", rarity, attack, weaponType, description }; }
function armor(name, rarity, defense, maxHp, description) { return { name, type: "equipment", slot: "chest", rarity, defense, maxHp, description }; }
function charm(name, rarity, attack, crit, description) { return { name, type: "equipment", slot: "amulet", rarity, attack, crit, description }; }
function bossGear(name, slot, setId, stats, description, weaponType = null) {
  const bossNames = { guardiao: "Guardião Sem Rosto", matriarca: "Matriarca Aracnídea", cervo: "Cervo-Rei Putrificado", lamento: "Dragão do Lamento", necromante: "Necromante dos Ossos", rei: "Rei Caído do Eclipse" };
  return { name, type: "equipment", slot: slot === "armor" ? "chest" : slot === "charm" ? "amulet" : slot, rarity: "lendário", setId, sourceBoss: bossNames[setId], bossItem: true, ...stats, ...(weaponType ? { weaponType } : {}), description };
}

function equipment(name, slot, rarity, requiredLevel, stats, sellValue, description, visual) {
  return { name, type: "equipment", slot, rarity, requiredLevel, stats, sellValue, description, visual };
}

function defineItems(definitions) {
  return deepFreeze(Object.fromEntries(Object.entries(definitions).map(([definitionId, definition]) => {
    const slot = definition.slot === "armor" ? "chest" : definition.slot === "charm" ? "amulet" : definition.slot;
    const rarity = RARITIES[definition.rarity] ? definition.rarity : definition.rarity === "boss" ? "lendário" : "comum";
    const stats = {
      ...(definition.stats || {}),
      ...(Number.isFinite(definition.attack) ? { attack: definition.attack } : {}),
      ...(Number.isFinite(definition.defense) ? { armor: definition.defense } : {}),
      ...(Number.isFinite(definition.maxHp) ? { maxHp: definition.maxHp } : {}),
      ...(Number.isFinite(definition.crit) ? { crit: definition.crit } : {})
    };
    const statValue = Object.values(stats).reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0);
    const normalized = {
      ...definition,
      definitionId,
      slot,
      rarity,
      requiredLevel: Math.max(1, Math.floor(definition.requiredLevel || 1)),
      stats,
      sellValue: Math.max(1, Math.floor(definition.sellValue || statValue * (RARITIES[rarity]?.rank || 1) + 2)),
      buyPrice: Math.max(3, Math.floor(definition.buyPrice || definition.sellValue * 3 || statValue * (RARITIES[rarity]?.rank || 1) * 3 + 6)),
      visual: definition.visual || defaultItemVisual(slot, definition.type)
    };
    delete normalized.attack;
    delete normalized.defense;
    delete normalized.maxHp;
    delete normalized.crit;
    return [definitionId, normalized];
  })));
}

function defaultItemVisual(slot, type) {
  const kind = type === "consumable" ? "potion" : type === "material" ? "material" : slot || "item";
  return { kind, style: "default", primary: "#aeb2a5", accent: "#d8b45e" };
}

export const SET_BONUSES = Object.freeze({
  guardiao: { name: "Legado Sem Rosto", attack: 5, defense: 4, maxHp: 15 },
  matriarca: { name: "Predadora das Profundezas", attack: 7, defense: 4, crit: 12 },
  cervo: { name: "Soberania do Bosque", attack: 8, defense: 8, maxHp: 50 },
  lamento: { name: "Poder do Lamento", attack: 15, defense: 10, crit: 8, maxHp: 40 },
  necromante: { name: "Senhor das Mil Almas", attack: 20, defense: 14, crit: 10, maxHp: 65 },
  rei: { name: "Soberania do Eclipse", attack: 28, defense: 18, crit: 12, maxHp: 90 }
});

export const SKILLS = deepFreeze({
  golpe_poderoso: {
    name: "Golpe Poderoso", classId: "warrior", kind: "active", hotkey: "Digit1", maxLevel: 5,
    requiredPlayerLevel: 1, weaponTypes: ["sword"], pointCosts: [1, 1, 1, 2, 2], cooldowns: [4.8, 4.55, 4.3, 4.05, 3.8],
    resource: { type: "stamina", costs: [24, 24, 23, 23, 22] },
    phases: { anticipation: .24, active: .16, recovery: .36 },
    effects: { damageMultipliers: [1.65, 1.78, 1.91, 2.04, 2.2], range: 94, arcDot: .18 },
    description: "Ergue a espada e desfere um golpe frontal descendente de grande impacto."
  },
  corte_giratorio: {
    name: "Corte Giratório", classId: "warrior", kind: "active", hotkey: "Digit2", maxLevel: 5,
    requiredPlayerLevel: 2, weaponTypes: ["sword"], prerequisite: { id: "golpe_poderoso", level: 1 }, pointCosts: [1, 1, 2, 2, 3],
    cooldowns: [7.5, 7.15, 6.8, 6.45, 6.1], resource: { type: "stamina", costs: [34, 33, 32, 31, 30] },
    phases: { anticipation: .2, active: .42, recovery: .32 },
    effects: { damageMultipliers: [1.15, 1.24, 1.33, 1.42, 1.52], radius: 88 },
    description: "Gira com a lâmina estendida e atinge uma vez cada inimigo próximo."
  },
  investida: {
    name: "Investida", classId: "warrior", kind: "active", hotkey: "Digit3", maxLevel: 5,
    requiredPlayerLevel: 3, weaponTypes: ["sword"], prerequisite: { id: "corte_giratorio", level: 1 }, pointCosts: [1, 1, 2, 2, 3],
    cooldowns: [6.4, 6.1, 5.8, 5.5, 5.2], resource: { type: "stamina", costs: [28, 27, 26, 25, 24] },
    phases: { anticipation: .18, active: .28, recovery: .3 },
    effects: { damageMultipliers: [1.35, 1.45, 1.55, 1.65, 1.78], range: 126, speed: 450, hitRadius: 38 },
    description: "Avança com a espada à frente, parando em obstáculos e ferindo alvos no caminho."
  },
  treinamento_marcial: {
    name: "Treinamento Marcial", classId: "warrior", kind: "passive", maxLevel: 5,
    requiredPlayerLevel: 1, pointCosts: [1, 1, 2, 2, 3], weaponTypes: ["sword"],
    effects: { damageBonuses: [.05, .08, .11, .14, .18] },
    description: "Aumenta o dano causado enquanto uma espada estiver equipada."
  },
  resistencia: {
    name: "Resistência", classId: "warrior", kind: "passive", maxLevel: 5,
    requiredPlayerLevel: 2, pointCosts: [1, 1, 2, 2, 3],
    effects: { armorPerLevel: 2, maxHpPerLevel: 6 },
    description: "Fortalece o corpo, aumentando armadura e vida máxima."
  }
});

// Configuração do jogo Canvas atualmente publicado. Novos conteúdos devem entrar
// em AREAS/ENEMIES/ITEMS; números que alteram regras do loop ficam aqui.
export const GAME_CONFIG = deepFreeze({
  save: {
    gameId: "KnightFall",
    schemaVersion: 7,
    primaryKey: "knightfall.save",
    legacyKeys: ["knightfall.visual.v1", "ecosDoAbismo.save"]
  },
  player: {
    defaultName: "Aldric",
    defaultTitle: "Guardião do Vale Cinzento",
    startPosition: { x: 430, y: 405, dirX: 1, dirY: 0 },
    baseAttributes: { for: 5, des: 5, con: 5, int: 5, esp: 5, sor: 5 },
    baseStats: { maxHp: 100, attack: 12, armor: 2, crit: 0, moveSpeed: 158 },
    startingCoins: 35,
    startingInventory: [
      { definitionId: "pocao_menor", quantity: 2 },
      { definitionId: "espada_enferrujada", quantity: 1 },
      { definitionId: "armadura_couro", quantity: 1 }
    ],
    startingEquipment: { weapon: "espada_enferrujada" },
    inventoryCapacity: 20
  },
  progression: {
    xpBase: 120,
    xpMultiplier: 1.42,
    hpPerLevel: 12,
    attackPerLevel: 2,
    killsPerEnemyLevel: 3,
    skillPointsPerLevel: 1
  },
  skills: {
    classId: "warrior",
    startingPoints: 1,
    staminaMax: 100,
    staminaRegenPerSecond: 18,
    masteryExpPerHit: 4,
    masteryExpDamageScale: 8,
    masteryTargetCap: 18,
    masteryEventCache: 256
  },
  combat: {
    playerAttackDuration: .32,
    enemyAttackDuration: .5,
    playerHitAt: .48,
    enemyHitAt: .46,
    playerRange: 76,
    enemyRange: 58,
    enemyStopDistance: 49,
    playerDamageVariance: [.88, 1.16],
    minimumDamageTaken: 2,
    invulnerabilitySeconds: .55,
    dodgeDuration: .2,
    dodgeCooldown: .7,
    dodgeSpeedMultiplier: 2.85,
    dodgeInvulnerabilitySeconds: .26,
    enemyAttackCooldown: 1.05,
    enemyInitialAttackDelay: .7,
    enemyRespawnDelay: 2.2
  },
  goblin: {
    names: ["Goblin Saqueador", "Goblin da Pedra", "Goblin Lâmina-Torta"],
    spawnPositions: [[190, 165], [815, 165], [185, 350], [815, 360]],
    hpBase: 34,
    hpPerLevel: 11,
    speedBase: 58,
    speedPerLevel: 2,
    speedLevelCap: 25,
    attackBase: 8,
    attackPerLevel: 2,
    xpBase: 24,
    xpPerLevel: 7,
    coinBase: 8,
    coinRandomExclusive: 8,
    coinPerLevel: 2,
    loot: [
      { definitionId: "pocao_menor", chance: .18 },
      { definitionId: "espada_curta", chance: .11 },
      { definitionId: "espada_ferro", chance: .035, minimumEnemyLevel: 2 },
      { definitionId: "armadura_couro", chance: .08 },
      { definitionId: "capacete_ferro", chance: .065 },
      { definitionId: "botas_couro", chance: .08 },
      { definitionId: "anel_vitalidade", chance: .03, minimumEnemyLevel: 2 },
      { definitionId: "amuleto_vigia", chance: .045 }
    ]
  },
  firstCave: {
    id: "caverna_sombria",
    name: "Caverna Sombria",
    totalFloors: 20,
    farm: {
      continuous: true,
      // Índice 0 representa o andar 1. O chefe usa vitórias, não abates comuns.
      unlockKills: [5, 6, 7, 8, 8, 9, 10, 11, 12, 12, 14, 15, 16, 18, 18, 20, 21, 23, 25, 1],
      spawnDelay: .48,
      waveBreak: 1.8,
      bossRespawnDelay: 4.5,
      projectileCap: 24,
      maxPathfindsPerFrame: 2,
      navigationRepath: [.42, .68],
      separationRadius: 31,
      separationStrength: .48,
      roles: {
        common: { threat: 1, hp: 1, attack: 1, speed: 1, reward: 1, archetype: "common", ai: { preferredDistance: 49, attackRange: 58, telegraph: .28, attackDuration: .3, recovery: .62, pattern: "slash", patterns: null } },
        swift: { threat: .9, hp: .72, attack: .82, speed: 1.24, reward: .72, archetype: "common", ai: { preferredDistance: 46, attackRange: 56, telegraph: .24, attackDuration: .26, recovery: .52, pattern: "slash", patterns: null } },
        tank: { threat: 1.65, hp: 1.55, attack: .92, speed: .76, reward: 1.28, archetype: "warrior", ai: { preferredDistance: 54, attackRange: 69, pattern: "cleave", patterns: null, telegraph: .5, attackDuration: .36, recovery: .82 } },
        ranged: { threat: 1.5, hp: .82, attack: .9, speed: .94, reward: 1.15, archetype: "archer", ai: { preferredDistance: 205, retreatDistance: 125, attackRange: 310, telegraph: .62, attackDuration: .18, recovery: .86, pattern: "arrow" } },
        elite: { threat: 2.5, hp: 1.25, attack: 1.15, speed: .94, reward: 1.45, archetype: "elite", ai: { preferredDistance: 62, attackRange: 78, telegraph: .72, attackDuration: .42, recovery: .88, patterns: ["heavy", "charge"] } }
      },
      bands: [
        { minFloor: 1, maxFloor: 4, maxActive: 2, waveSize: [2, 3], threatBudget: [2, 2.8], roles: { common: 4, swift: 1 } },
        { minFloor: 5, maxFloor: 9, maxActive: 3, waveSize: [2, 3], threatBudget: [2.5, 3.8], roles: { common: 3, swift: 1, tank: 1 } },
        { minFloor: 10, maxFloor: 14, maxActive: 3, waveSize: [3, 4], threatBudget: [3.5, 4.8], roles: { common: 2, swift: 1, ranged: 2, tank: 1 } },
        { minFloor: 15, maxFloor: 19, maxActive: 4, waveSize: [3, 4], threatBudget: [4.2, 6], roles: { common: 2, ranged: 2, tank: 1, elite: 1 } },
        { minFloor: 20, maxFloor: 20, maxActive: 1, waveSize: [1, 1], threatBudget: [1, 1], roles: { boss: 1 } }
      ]
    },
    tiers: [
      {
        id: "common", label: "Covil Goblin", minFloor: 1, maxFloor: 5, archetype: "common",
        names: ["Goblin Saqueador", "Goblin da Pedra", "Goblin Lâmina-Torta"],
        stats: { hpBase: 42, hpPerFloor: 7, attackBase: 8, attackPerFloor: 1.1, speed: 62 },
        ai: { preferredDistance: 49, attackRange: 58, telegraph: .28, attackDuration: .3, recovery: .62, pattern: "slash" },
        rewards: { xpBase: 4, xpPerFloor: 1, coinsBase: 2, coinsPerFloor: .55, coinVariance: 3, multiplier: 1 },
        loot: [
          { definitionId: "pocao_menor", chance: .18 }, { definitionId: "espada_curta", chance: .08 },
          { definitionId: "armadura_couro", chance: .07 }, { definitionId: "botas_couro", chance: .06 },
          { definitionId: "fragmento_ferro", chance: .34 }
        ],
        visual: { scale: 1, skin: "#9aa04b", armor: "#755038", accent: "#d9c86d", weapon: "knife" }
      },
      {
        id: "warrior", label: "Posto dos Guerreiros", minFloor: 6, maxFloor: 10, archetype: "warrior",
        names: ["Goblin Guerreiro", "Quebra-Escudos", "Lâmina Rubra"],
        stats: { hpBase: 88, hpPerFloor: 9, attackBase: 15, attackPerFloor: 1.25, speed: 67 },
        ai: { preferredDistance: 54, attackRange: 69, telegraph: .46, attackDuration: .36, recovery: .78, pattern: "cleave" },
        rewards: { xpBase: 5, xpPerFloor: 1, coinsBase: 3, coinsPerFloor: .7, coinVariance: 4, multiplier: 1 },
        loot: [
          { definitionId: "espada_ferro", chance: .08 }, { definitionId: "capacete_ferro", chance: .1 },
          { definitionId: "armadura_couro", chance: .11 }, { definitionId: "fragmento_ferro", chance: .42 },
          { definitionId: "fragmento_aco", chance: .14 }
        ],
        visual: { scale: 1.08, skin: "#879144", armor: "#6e3530", accent: "#bec4bc", weapon: "sword" }
      },
      {
        id: "archer", label: "Galerias dos Arqueiros", minFloor: 11, maxFloor: 15, archetype: "archer",
        names: ["Goblin Arqueiro", "Olho-Amarelo", "Batedor da Caverna"],
        stats: { hpBase: 102, hpPerFloor: 8, attackBase: 17, attackPerFloor: 1.15, speed: 73 },
        ai: { preferredDistance: 205, retreatDistance: 125, attackRange: 310, telegraph: .62, attackDuration: .18, recovery: .86, pattern: "arrow" },
        rewards: { xpBase: 6, xpPerFloor: 1.05, coinsBase: 4, coinsPerFloor: .8, coinVariance: 5, multiplier: 1 },
        loot: [
          { definitionId: "amuleto_vigia", chance: .1 }, { definitionId: "anel_vitalidade", chance: .07 },
          { definitionId: "pocao_maior", chance: .12 }, { definitionId: "fragmento_ferro", chance: .2 },
          { definitionId: "essencia", chance: .32 }
        ],
        visual: { scale: 1, skin: "#a3a94e", armor: "#4c4930", accent: "#c79b50", weapon: "bow" }
      },
      {
        id: "elite", label: "Guarda de Elite", minFloor: 16, maxFloor: 19, archetype: "elite",
        names: ["Campeão Goblin", "Executor da Coroa", "Guarda Negro"],
        stats: { hpBase: 168, hpPerFloor: 17, attackBase: 23, attackPerFloor: 1.8, speed: 77 },
        ai: { preferredDistance: 62, attackRange: 78, telegraph: .72, attackDuration: .42, recovery: .88, patterns: ["heavy", "charge"] },
        rewards: { xpBase: 9, xpPerFloor: 1.25, coinsBase: 6, coinsPerFloor: 1, coinVariance: 7, multiplier: 1 },
        loot: [
          { definitionId: "espada_ferro", chance: .16 }, { definitionId: "anel_vitalidade", chance: .12 },
          { definitionId: "pocao_maior", chance: .2 }, { definitionId: "fragmento_aco", chance: .44 },
          { definitionId: "essencia", chance: .52 }, { definitionId: "cristal_raro", chance: .06 }
        ],
        visual: { scale: 1.18, skin: "#76843d", armor: "#292a28", accent: "#c25a47", weapon: "greatsword" }
      },
      {
        id: "boss", label: "Salão da Coroa", minFloor: 20, maxFloor: 20, archetype: "boss",
        names: ["Rei Goblin"],
        stats: { hpBase: 460, hpPerFloor: 0, attackBase: 29, attackPerFloor: 0, speed: 72 },
        ai: {
          preferredDistance: 72, attackRange: 94, telegraph: .82, attackDuration: .48, recovery: .9,
          phaseTwoThreshold: .45, phaseTwoSpeedMultiplier: 1.2, phaseTwoDamageMultiplier: 1.25,
          patterns: ["heavy", "charge", "area"], areaRadius: 118, chargeSpeed: 300
        },
        rewards: { xpBase: 240, xpPerFloor: 0, coinsBase: 90, coinsPerFloor: 0, coinVariance: 25, multiplier: 1.8 },
        firstVictory: { xp: 220, coins: 140, items: [{ definitionId: "coroa_rei_goblin", quantity: 1 }] },
        loot: [
          { definitionId: "pocao_maior", chance: .45 }, { definitionId: "anel_vitalidade", chance: .2 },
          { definitionId: "amuleto_vigia", chance: .22 }, { definitionId: "fragmento_aco", chance: .75 },
          { definitionId: "essencia", chance: 1 }, { definitionId: "cristal_raro", chance: .22 }
        ],
        visual: { scale: 1.62, skin: "#788838", armor: "#4d2020", accent: "#e0b84f", weapon: "royal_blade" }
      }
    ]
  },
  ashenGrove: {
    id: "bosque_cinzas", name: "Bosque das Cinzas", totalFloors: 10,
    tiers: [
      {
        id: "ash_beasts", label: "Trilha Carbonizada", minFloor: 1, maxFloor: 3, archetype: "common",
        names: ["Corvo Carniceiro", "Lobo Sombrio", "Lobo das Brasas"],
        stats: { hpBase: 118, hpPerFloor: 13, attackBase: 18, attackPerFloor: 1.6, speed: 86 },
        ai: { preferredDistance: 48, attackRange: 60, telegraph: .34, attackDuration: .28, recovery: .55, pattern: "slash" },
        rewards: { xpBase: 82, xpPerFloor: 10, coinsBase: 24, coinsPerFloor: 3, coinVariance: 11, multiplier: 1.2 },
        loot: [{ definitionId: "seiva_corrompida", chance: .48 }, { definitionId: "anel_agilidade", chance: .08 }, { definitionId: "amuleto_presa", chance: .1 }],
        visual: {
          species: "wolf", speciesByName: { "Corvo Carniceiro": "raven" },
          scale: 1.05, skin: "#4c4641", armor: "#302d2a", accent: "#c26a45", weapon: "fang"
        }
      },
      {
        id: "ash_cultists", label: "Círculo dos Cultistas", minFloor: 4, maxFloor: 6, archetype: "archer",
        names: ["Cultista das Cinzas", "Portador da Brasa", "Vigia do Véu"],
        stats: { hpBase: 148, hpPerFloor: 15, attackBase: 22, attackPerFloor: 1.8, speed: 70 },
        ai: { preferredDistance: 215, retreatDistance: 120, attackRange: 320, telegraph: .68, attackDuration: .2, recovery: .9, pattern: "ash_bolt" },
        rewards: { xpBase: 112, xpPerFloor: 12, coinsBase: 34, coinsPerFloor: 4, coinVariance: 14, multiplier: 1.28 },
        loot: [{ definitionId: "cinza_viva", chance: .38 }, { definitionId: "manto_cinza", chance: .12 }, { definitionId: "espada_cinzas", chance: .07 }],
        visual: { species: "cultist", scale: 1.05, skin: "#b49476", armor: "#3e3534", accent: "#dc7548", weapon: "staff" }
      },
      {
        id: "ash_ents", label: "Coração Morto", minFloor: 7, maxFloor: 9, archetype: "elite",
        names: ["Ente das Cinzas", "Guardião Carbonizado", "Raiz Faminta"],
        stats: { hpBase: 225, hpPerFloor: 22, attackBase: 27, attackPerFloor: 2.2, speed: 55 },
        ai: { preferredDistance: 68, attackRange: 86, telegraph: .78, attackDuration: .46, recovery: .92, patterns: ["heavy", "area"], areaRadius: 102 },
        rewards: { xpBase: 155, xpPerFloor: 15, coinsBase: 48, coinsPerFloor: 5, coinVariance: 18, multiplier: 1.45 },
        loot: [{ definitionId: "seiva_corrompida", chance: .72 }, { definitionId: "cinza_viva", chance: .58 }, { definitionId: "armadura_casca", chance: .14 }, { definitionId: "cristal_raro", chance: .05 }],
        visual: { species: "ent", scale: 1.28, skin: "#64523c", armor: "#40382f", accent: "#d47b46", weapon: "branch" }
      },
      {
        id: "rotten_stag", label: "Trono das Raízes", minFloor: 10, maxFloor: 10, archetype: "boss",
        names: ["Cervo-Rei Putrificado"],
        stats: { hpBase: 620, hpPerFloor: 0, attackBase: 34, attackPerFloor: 0, speed: 88 },
        ai: { preferredDistance: 82, attackRange: 102, telegraph: .88, attackDuration: .5, recovery: .94, phaseTwoThreshold: .5, phaseTwoSpeedMultiplier: 1.18, phaseTwoDamageMultiplier: 1.28, patterns: ["heavy", "charge", "area"], areaRadius: 132, chargeSpeed: 325 },
        rewards: { xpBase: 360, xpPerFloor: 0, coinsBase: 125, coinsPerFloor: 0, coinVariance: 30, multiplier: 1.7 },
        firstVictoryKey: "rottenStagFirstVictory",
        firstVictory: { xp: 300, coins: 190, items: [{ definitionId: "coroa_cervo", quantity: 1 }] },
        loot: [{ definitionId: "seiva_corrompida", chance: 1 }, { definitionId: "cinza_viva", chance: 1 }, { definitionId: "espada_cinzas", chance: .22 }, { definitionId: "cristal_raro", chance: .2 }],
        visual: { species: "stag", scale: 1.62, skin: "#6b6047", armor: "#392d2a", accent: "#e07845", weapon: "antlers" }
      }
    ]
  },
  regions: {
    caverna_sombria: { name: "Caverna Sombria", order: 1, configKey: "firstCave", bossId: "rei_goblin", recommendedLevel: [1, 5], unlock: { type: "always" }, status: "playable" },
    bosque_cinzas: { name: "Bosque das Cinzas", order: 2, configKey: "ashenGrove", bossId: "cervo_putrido", recommendedLevel: [5, 9], unlock: { type: "boss", bossId: "rei_goblin", label: "Derrote o Rei Goblin" }, status: "playable" },
    montanhas_lamento: { name: "Montanhas do Lamento", order: 3, recommendedLevel: [9, 12], unlock: { type: "regionBoss", regionId: "bosque_cinzas" }, status: "planned" },
    catacumbas_esquecidas: { name: "Catacumbas Esquecidas", order: 4, recommendedLevel: [13, 16], unlock: { type: "regionBoss", regionId: "montanhas_lamento" }, status: "planned" },
    fortaleza_eclipse: { name: "Fortaleza do Eclipse", order: 5, recommendedLevel: [17, 20], unlock: { type: "regionBoss", regionId: "catacumbas_esquecidas" }, status: "planned" }
  },
  economy: {
    potionPrice: 15,
    restPrice: 8,
    attackUpgrade: { basePrice: 65, priceStep: 28, amount: 3, maxPurchases: 8 },
    armorUpgrade: { basePrice: 70, priceStep: 32, amount: 2, maxPurchases: 8 },
    defeatCoinLossRatio: .2,
    defeatMinimumCoinLoss: 5,
    merchantEquipment: ["espada_curta", "capacete_ferro", "botas_couro"],
    enhancedSaleCostRatio: .18
  },
  forge: {
    maxLevel: 10,
    defaultStatGrowth: .1,
    statGrowthBySlot: {
      weapon: { attack: .12, crit: .06 },
      helmet: { armor: .12, maxHp: .1 },
      chest: { armor: .12, maxHp: .1 },
      boots: { armor: .1, maxHp: .08, moveSpeed: .04 },
      ring: { maxHp: .1, attack: .1, armor: .1, crit: .08, moveSpeed: .04 },
      amulet: { maxHp: .1, attack: .1, armor: .1, crit: .08, moveSpeed: .04 }
    },
    costs: {
      1: { gold: 30, materials: { fragmento_ferro: 2 } },
      2: { gold: 45, materials: { fragmento_ferro: 2 } },
      3: { gold: 65, materials: { fragmento_ferro: 3 } },
      4: { gold: 90, materials: { fragmento_ferro: 3, fragmento_aco: 1 } },
      5: { gold: 120, materials: { fragmento_ferro: 4, fragmento_aco: 2 } },
      6: { gold: 155, materials: { fragmento_ferro: 5, fragmento_aco: 3 } },
      7: { gold: 195, materials: { fragmento_aco: 4, essencia: 2 } },
      8: { gold: 240, materials: { fragmento_aco: 5, essencia: 3, seiva_corrompida: 2 } },
      9: { gold: 295, materials: { fragmento_aco: 6, essencia: 4, cinza_viva: 2, cristal_raro: 1 } },
      10: { gold: 360, materials: { fragmento_aco: 8, essencia: 6, seiva_corrompida: 4, cinza_viva: 3, cristal_raro: 2 } }
    }
  }
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
