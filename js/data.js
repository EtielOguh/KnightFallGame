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

export const ITEMS = Object.freeze({
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
  coroa_cervo: bossGear("Coroa do Cervo-Rei", "helmet", "cervo", { defense: 7, maxHp: 16 }, "Símbolo do soberano do bosque."),
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
  armadura_casca: armor("Armadura de Casca", "raro", 7, 18, "Madeira morta que se recusa a quebrar."),
  peitoral_pedra: armor("Peitoral de Pedra", "épico", 10, 24, "Pesado como a montanha."),
  escudo_ferro: { ...armor("Broquel de Ferro", "incomum", 4, 5, "Pequeno escudo preso ao antebraço."), slot: "charm" },
  amuleto_presa: charm("Amuleto de Presa", "incomum", 2, 5, "Aumenta o instinto assassino."),
  anel_agilidade: charm("Anel do Corvo", "raro", 3, 7, "Torna cada movimento mais preciso."),
  maca_catacumba: weapon("Maça de Catacumba", "raro", 19, "Feita para romper ossos e armaduras.", "axe"),
  placas_ossada: armor("Placas de Ossada", "épico", 15, 34, "Proteção montada com restos de cavaleiros."),
  anel_espectral: charm("Anel Espectral", "épico", 8, 10, "Torna a mão quase translúcida."),
  espada_eclipse: weapon("Espada do Eclipse", "épico", 28, "Sua lâmina alterna entre luz e sombra."),
  cetro_real: weapon("Cetro Real Corrompido", "épico", 30, "Símbolo de autoridade transformado em arma.", "staff"),
  armadura_carrasco: armor("Armadura do Carrasco", "épico", 22, 48, "Placas negras cobertas por sentenças."),
  olho_quimera: charm("Olho da Quimera", "épico", 12, 13, "Continua seguindo seus inimigos."),

  pocao_menor: { name: "Poção Menor", type: "consumable", rarity: "comum", heal: 40, description: "Recupera 40 HP." },
  pocao_maior: { name: "Poção Maior", type: "consumable", rarity: "raro", heal: 90, description: "Recupera 90 HP." },
  pocao_suprema: { name: "Poção Suprema", type: "consumable", rarity: "épico", heal: 170, description: "Recupera 170 HP." },
  fragmento_ferro: { name: "Fragmento de Ferro", type: "material", rarity: "comum", description: "Material para fortalecer equipamentos." },
  essencia: { name: "Essência Abissal", type: "material", rarity: "incomum", description: "Energia usada na evolução de itens." }
});

function weapon(name, rarity, attack, description, weaponType = "sword") { return { name, type: "equipment", slot: "weapon", rarity, attack, weaponType, description }; }
function armor(name, rarity, defense, maxHp, description) { return { name, type: "equipment", slot: "armor", rarity, defense, maxHp, description }; }
function charm(name, rarity, attack, crit, description) { return { name, type: "equipment", slot: "charm", rarity, attack, crit, description }; }
function bossGear(name, slot, setId, stats, description, weaponType = null) {
  const bossNames = { guardiao: "Guardião Sem Rosto", matriarca: "Matriarca Aracnídea", cervo: "Cervo-Rei Putrificado", lamento: "Dragão do Lamento", necromante: "Necromante dos Ossos", rei: "Rei Caído do Eclipse" };
  return { name, type: "equipment", slot, rarity: "boss", setId, sourceBoss: bossNames[setId], bossItem: true, ...stats, ...(weaponType ? { weaponType } : {}), description };
}

export const SET_BONUSES = Object.freeze({
  guardiao: { name: "Legado Sem Rosto", attack: 5, defense: 4, maxHp: 15 },
  matriarca: { name: "Predadora das Profundezas", attack: 7, defense: 4, crit: 12 },
  cervo: { name: "Soberania do Bosque", attack: 8, defense: 8, maxHp: 50 },
  lamento: { name: "Poder do Lamento", attack: 15, defense: 10, crit: 8, maxHp: 40 },
  necromante: { name: "Senhor das Mil Almas", attack: 20, defense: 14, crit: 10, maxHp: 65 },
  rei: { name: "Soberania do Eclipse", attack: 28, defense: 18, crit: 12, maxHp: 90 }
});

export const SKILLS = Object.freeze({
  golpe_poderoso: { name: "Golpe Poderoso", level: 1, energy: 2, multiplier: 1.65, description: "Ataque pesado que causa 165% de dano." },
  corte_preciso: { name: "Corte Preciso", level: 3, energy: 2, multiplier: 1.25, critBonus: 35, description: "Ataque com grande chance de crítico." },
  furia_abissal: { name: "Fúria Abissal", level: 6, energy: 3, multiplier: 2.25, description: "Canaliza o abismo em um golpe devastador." },
  queda_cavaleiro: { name: "Queda do Cavaleiro", level: 10, energy: 3, multiplier: 2.8, description: "Um golpe final digno de KnightFall." }
});
