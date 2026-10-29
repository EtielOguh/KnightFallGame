# Arquitetura do KnightFall

## Execução

O navegador carrega apenas `js/game.js` pelo `index.html`. Os demais módulos ativos entram pelo grafo de imports:

```text
index.html
└── game.js                 loop, input, combate, IA e renderização Canvas
    ├── data.js             conteúdo e balanceamento declarativo
    ├── state.js            estado raiz, normalização e validação
    │   └── player.js       modelo do personagem, inventário e atributos derivados
    │       └── progression.js
    ├── save.js             persistência, versões e migrações
    ├── dungeon.js          regiões, metas de abate, recompensas e desbloqueios
    ├── farm.js             ondas, IDs, respawn e propriedade de projéteis
    ├── forge.js            custos e transações atômicas de reforço/compra/venda
    ├── skills.js           habilidades, vigor, passivas e maestria em combate
    ├── loot.js             rolagem pura das tabelas de recompensa
    └── music.js            áudio procedural
```

A interface textual anterior foi removida do repositório. Sua compatibilidade de save permanece isolada nas migrações de `save.js`; nenhuma regra do jogo Canvas depende da apresentação antiga.

## Resultado da auditoria

Antes da consolidação, `game.js` mantinha sozinho um personagem plano, áudio Web Audio e o save `knightfall.visual.v1`. Em paralelo, os outros módulos descreviam outro personagem, outro inventário e o save `ecosDoAbismo.save`; nenhum deles era importado pelo HTML.

Foram reaproveitados:

- os catálogos de regiões, inimigos, itens, conjuntos e habilidades de `data.js`, ativados gradualmente pelas interfaces atuais;
- a curva de progressão e o domínio de armas de `progression.js`, agora ligados ao mesmo modelo de jogador;
- as instâncias de inventário com `uid`, níveis de equipamento e slots da camada antiga;
- o sintetizador procedural de `music.js`;
- os dois formatos de save anteriores, agora tratados como fontes de migração.

Foram removidas da execução as duplicações de `freshState`, `nextXp`, contador isolado de poções, atributos `damage/armor` concorrentes, acesso direto ao `localStorage` e segundo contexto de áudio em `game.js`.

O schema 9 removeu do estado canônico treino offline, auto-farm, pity e campos de navegação da interface antiga. A migração continua aceitando esses dados como entrada, converte o histórico de chefes e descarta o restante sem regravá-lo.

## Responsabilidades

| Módulo | Responsabilidade | Não deve conter |
| --- | --- | --- |
| `game.js` | Sessão em tempo real, movimentação, colisão, A*, combate, NPC Bram, input, HUD e renderização procedural | Formato de save, modelo alternativo de jogador ou números centrais de balanceamento |
| `data.js` | Catálogos futuros e `GAME_CONFIG` | Mutação de estado e acesso ao DOM |
| `state.js` | Criação, normalização, validação e snapshot seguro do estado raiz | Renderização e `localStorage` |
| `player.js` | Modelo do personagem, inventário, equipamentos e cálculo único de atributos efetivos | HUD, IA ou persistência |
| `progression.js` | Curvas de XP, level-up e domínio | Estado global |
| `save.js` | Envelope versionado, leitura, gravação, fallback e migrações | Regras de combate |
| `dungeon.js` | Configuração regional, desbloqueios, encontros, avanço e recompensa única | DOM, Canvas e estado global |
| `farm.js` | Runtime transitório e testável de ondas, limites, IDs e idempotência por inimigo | Save, DOM ou regras de item |
| `forge.js` | Custo, prévia e transações de reforço, compra e venda | DOM, Canvas, save ou moedas paralelas |
| `skills.js` | Desbloqueio, níveis, vigor, cooldowns, fases, colisão declarativa, passivas e concessão protegida de maestria | DOM, Canvas ou estado global |
| `loot.js` | Filtragem e rolagem testável das tabelas de loot | Mutação do inventário |
| `music.js` | Web Audio e sequências procedurais | Estado persistente |

## Estado canônico

`state` em `game.js` é a única instância mutável da partida. O formato persistido é:

```text
state
├── schemaVersion
├── player
│   ├── id, name, title, originId
│   ├── level, xp, hp
│   ├── attributes              atributos primários
│   ├── baseStats               maxHp, attack, armor, crit, moveSpeed
│   ├── coins
│   ├── inventory[]             pilhas e instâncias por uid
│   ├── equipment               uid por slot
│   ├── skillProgression        classe, pontos e níveis ativos/passivos
│   ├── resources               vigor atual e máximo
│   ├── weaponMastery
│   ├── progression
│   │   ├── kills
│   │   └── upgrades
│   ├── bag
│   └── x, y, facing, dirX, dirY
├── world
│   ├── scene, caveVisits
│   ├── currentRegionId
│   ├── regionProgress
│   │   └── <regionId>
│   │       ├── highestUnlockedFloor
│   │       ├── selectedFloor
│   │       ├── floorKills
│   │       ├── floorObjectivesCompleted
│   │       ├── floorCompletions
│   │       ├── bossVictories
│   │       ├── uniqueRewardsClaimed
│   │       └── expedition             incursão temporária ativa ou null
│   │           ├── id, regionId, floor, state
│   │           ├── floorKills, farmKills, completedFloors
│   │           └── bossUnlocked, bossSpawned, bossDefeated, completed
├── settings                    áudio
├── flags
└── metadata
```

Valores efetivos de combate nunca são copiados para a interface. `calculateStatBreakdown(player, temporários)` separa base, equipamento e modificadores temporários; `calculateStats` devolve apenas o total. A HUD, o dano, a defesa, a velocidade e o inventário consultam essas mesmas funções. Equipar apenas troca o `uid` referenciado no slot, portanto repetir a operação nunca acumula bônus.

### Habilidades e maestria

`SKILLS` em `data.js` é a fonte única de requisitos, níveis máximos, custos em pontos, cooldowns, vigor, fases e efeitos. Habilidades ativas também podem exigir maestria da arma. O primeiro ponto chega no nível 3 e os seguintes em níveis alternados, conforme `GAME_CONFIG.progression`; esse cálculo não é duplicado na interface. `player.skillProgression` guarda apenas classe, pontos e níveis aprendidos; `player.resources` guarda o vigor. Cooldowns e a habilidade em execução pertencem a `skillRuntime` em `game.js` e não entram no save.

As técnicas usam as fases `anticipation`, `active`, `recovery` e `complete`. A esquiva pode cancelar somente `anticipation`; o vigor permanece gasto e o cooldown continua. Depois da janela ativa começar, movimento, ataque básico e outras habilidades permanecem bloqueados até a recuperação terminar. Receber dano não cancela a técnica. Cada execução mantém `hitTargets`, garantindo um único dano por alvo e evento.

`Golpe Poderoso` usa cone frontal, `Corte Giratório` usa raio próximo e `Investida` desloca o jogador pelas mesmas colisões de cenário do movimento normal, até seu alcance máximo. A arte dessas ações é desenhada no Canvas com poses de espada próprias para antecipação, movimento e recuperação.

A maestria identifica o tipo da arma equipada e recebe experiência apenas em `applyPlayerDamage`, após dano positivo. IDs de evento impedem repetição, cada inimigo possui teto configurável em `GAME_CONFIG.skills.masteryTargetCap` e a curva `250 × nível^1,55` torna os próximos graus deliberadamente mais lentos. O multiplicador de maestria e `Treinamento Marcial` entram no cálculo final do dano; `Resistência` entra uma única vez no bloco `passive` do cálculo de atributos.

Para adicionar uma habilidade futura, inclua sua definição com `classId` e `kind` em `SKILLS`, adicione o comportamento ativo ao executor de combate quando necessário e uma representação procedural em `drawSkillIcon`/`drawPlayerSkillAnimation`. A estrutura já aceita novos `classId`, mas somente `warrior` está disponível.

### Itens e equipamentos

Há dois formatos deliberadamente distintos:

```js
// definição imutável em data.js
ITEMS.espada_ferro = {
  definitionId: "espada_ferro",
  name: "Espada de Ferro",
  type: "equipment",
  slot: "weapon",
  requiredLevel: 2,
  rarity: "raro",
  stats: { attack: 7 },
  sellValue: 22,
  visual: { kind: "sword", style: "iron", metal: "#dce5e2" }
}

// instância mutável dentro de player.inventory
{
  uid: "item_<uuid>",
  definitionId: "espada_ferro",
  quantity: 1,
  enhancementLevel: 0,
  isNew: true
}
```

Os seis slots canônicos são `weapon`, `helmet`, `chest`, `boots`, `ring` e `amulet`. `player.equipment` guarda somente o `uid` da instância que continua no inventário. Consumíveis e materiais usam a mesma estrutura, mas podem formar pilhas. A capacidade contabiliza pilhas/instâncias, não a soma das quantidades.

### Forja e economia

O nível de reforço pertence à instância (`inventory[].enhancementLevel`), limitado entre +0 e +10. Duas instâncias da mesma definição podem, portanto, ter reforços diferentes. `calculateItemStats` consulta o crescimento por slot em `GAME_CONFIG.forge.statGrowthBySlot`; nenhuma bonificação é gravada separadamente no personagem.

`GAME_CONFIG.forge.costs` é a fonte única do ouro e materiais necessários para cada próximo nível. Os seis materiais ativos são `fragmento_ferro` (Minério de Ferro), `fragmento_aco`, `essencia` (Essência Goblin), `seiva_corrompida`, `cinza_viva` e `cristal_raro`; todos aparecem em custos e em tabelas de loot das regiões jogáveis.

`forge.js` valida a operação inteira antes de alterar recursos. Reforço, compra e venda aceitam um identificador de transação para rejeitar reenvios na mesma sessão. A interface também bloqueia o botão enquanto a operação está sendo confirmada e grava o save imediatamente após o sucesso. Itens equipados não podem ser vendidos. `getSaleReturn` calcula o retorno canônico: peças comuns geram principalmente ouro e raridades superiores recuperam minério/cristal segundo `economy.salvageByRarity`. A capacidade para todos os materiais é validada antes de remover a peça, portanto uma mochila cheia não causa perda parcial. O valor de uma peça reforçada recupera uma fração configurável do investimento por meio de `calculateSalePrice`.

Para adicionar um novo material, defina-o em `ITEMS`, use-o em ao menos um nível de `GAME_CONFIG.forge.costs` e inclua uma fonte configurável de loot. Para adicionar um equipamento à loja, inclua seu `definitionId` em `GAME_CONFIG.economy.merchantEquipment`; `buyPrice` pode ser informado ou derivado do valor de venda.

As raridades aceitas são `comum`, `incomum`, `raro`, `épico` e `lendário`. Cor, nome e ordem ficam em `RARITIES`; dados visuais não alteram regras de combate.

Para adicionar um equipamento:

1. inclua uma definição em `ITEMS` usando `equipment(...)` ou o formato equivalente;
2. informe um dos seis slots, requisito, raridade, `stats`, valor e `visual`;
3. quando necessário, acrescente uma variação à função procedural de ícone/vestimenta em `game.js`;
4. adicione a definição à tabela de loot apropriada em `GAME_CONFIG`;
5. cubra requisito, atributo e persistência em `tests/`.

Contagens de itens são obtidas do inventário com `inventoryCount`; não existe um segundo contador de poções. XP necessário é calculado por `playerExpRequired`; não é persistido como `nextXp`.

O encontro ativo, `farmRuntime`, inimigos, estados de IA, projéteis, timers, teclas, partículas e efeitos são transitórios e não entram no save. Cada inimigo recebe ID, estado, animação de morte e trava de recompensa próprios. Projéteis carregam `ownerId`; o limite configurável impede crescimento sem controle. A fila de IDs recompensados mantém no máximo 512 entradas por sessão.

## Incursões de cave

Cada região jogável possui dez andares e configuração independente em `data.js`. `farm.floorRules` é a fonte única de eliminações, tamanho de onda, teto simultâneo e multiplicadores de vida/ataque/defesa; `farm.bands` define orçamento e composição; `farm.roles` aplica variações comum, rápida, resistente, arqueiro, arremessador e elite sem duplicar IA. `boss` permanece separado das faixas comuns, portanto nunca surge por uma rolagem normal de onda.

Na tabela inicial, as metas são `8, 9, 10, 11, 12, 13, 14, 15, 16, 20` — 128 eliminações comuns por incursão. As ondas crescem de 2–3 para 5–6 atores e o teto vivo de 3 para 6. `createEncounterSpec` aplica o multiplicador somente à nova instância; as definições-base congeladas não são alteradas nem acumulam escalas após recriação/save.

O ciclo explícito de `expedition.state` é:

```text
ACTIVE → FLOOR_COMPLETED ── avançar ──→ ACTIVE/BOSS_PREPARATION
                 └──────── permanecer → FARMING ── avançar ──┘
BOSS_PREPARATION → BOSS_PENDING → BOSS_ACTIVE → CAVE_COMPLETED
```

Ao concluir os andares 1–9, novos spawns param, inimigos restantes continuam e o HUD oferece `Avançar` e `Permanecer` sem pausar a partida. Permanecer registra abates extras em `farmKills`, sem repetir conclusão; avançar continua disponível. No andar 10, 20 mortes comuns levam a `BOSS_PENDING`; somente quando a lista de ameaças fica vazia `markBossSpawned` arma uma única entidade do chefe. Depois da vitória, nenhum spawn é permitido e a saída encerra a incursão. A próxima entrada cria outro ID e começa no andar 1.

Na Caverna Sombria:

- 1–2: comuns e rápidos;
- 3–4: arremessadores de pedra;
- 5–6: resistentes e composições mistas;
- 7–8: arqueiros e controle de distância;
- 9–10: elites e até dois atacantes à distância;
- após 20 abates no andar 10: Rei Goblin com golpe pesado, investida, área e fase 2.

A IA usa os estados `patrol`, `chase`, `telegraph`, `attack`, `recover`, `hurt` e `dying`. A navegação mantém linha direta, A* e deslizamento por obstáculos. O orçamento de A* limita recálculos por quadro e cada ator recebe um intervalo de replanejamento; separação física impede empilhamento. Todo ataque perigoso passa por `telegraph`; a direção é travada no começo da preparação para oferecer uma janela real de reação.

Cada ator carrega `regionId`, `expeditionId`, andar e ID de entidade. `recordFloorKill` recusa entidades de outra sessão; `claimEnemyReward` impede repetição do mesmo ID. A recompensa só é entregue depois dessa validação. Inimigos que já estavam vivos ao completar a meta ainda concedem seus drops normais, mas não repetem a conclusão.

`loot.js` mantém consumíveis e materiais como rolagens independentes, mas agrupa todos os equipamentos em um único canal ponderado. Assim, um inimigo nunca concede duas peças simultaneamente, e as chances de equipamento ficam separadas das fontes necessárias à forja.

## Regiões e Bosque das Cinzas

`GAME_CONFIG.regions` é o catálogo de navegação. Cada entrada define nome, ordem, faixa de nível, estado (`playable` ou `planned`), chave de configuração e requisito de desbloqueio. `regionUnlockStatus` interpreta essas regras sem condições espalhadas pelo loop. O mapa permite revisitar qualquer região jogável desbloqueada.

Cada região possui um registro próprio em `world.regionProgress`; selecionar outra região nunca copia ou reinicia o progresso anterior. A antiga `world.caveProgress` é aceita somente pela migração e convertida para `regionProgress.caverna_sombria`. O runtime mantém a cena interna `cave` por compatibilidade, mas cenário, obstáculos, encontros, loot e chefe vêm de `currentRegionId`.

O Bosque das Cinzas é a segunda região completa, desbloqueada por `regionProgress.caverna_sombria.bossVictories`. Ele usa o mesmo motor de dez andares e estados, mas possui papéis, composição, atributos-base, cenário, loot e Cervo-Rei próprios. Montanhas do Lamento, Catacumbas Esquecidas e Fortaleza do Eclipse permanecem apenas no catálogo.

## Save e migração

O formato atual usa a chave `knightfall.save`, envelope versão 9:

```json
{
  "game": "KnightFall",
  "version": 9,
  "savedAt": "ISO-8601",
  "state": {}
}
```

A leitura tenta, nesta ordem:

1. `knightfall.save`;
2. `knightfall.visual.v1`, usado pelo protótipo Canvas;
3. `ecosDoAbismo.save`, usado pela interface textual antiga.

Cada formato possui migração explícita antes de `normalizeGameState`. A versão 8 inicia `expedition: null`, pois contadores antigos de 20 andares não descrevem com segurança uma incursão nova de dez. A versão 9 importa `bossesDefeated` antigo para `bossVictories` e deixa de persistir `bossesDefeated`, `bossPity`, `currentArea` e sessões offline. Nível, XP, moedas, inventário, UIDs, equipamento e reforços são preservados; valores inválidos são limitados e saves futuros são recusados.

O snapshot atual preserva cena, andar, contadores e estado da incursão. Entidades vivas não são serializadas. Se um save/saída/morte descarregar um chefe em `BOSS_ACTIVE`, `prepareExpeditionAfterLoad` o rearma como `BOSS_PENDING`; ele retorna com vida cheia e uma única instância, sem repetir uma recompensa já registrada. HP zero usa retorno seguro à vila, mas conserva a incursão para retomada.

## Regras permanentes de combate

- O ataque básico de espada é um golpe descendente: a lâmina começa acima da cabeça e termina abaixo, com o arco espelhado para a mão correspondente. Novas espadas devem preservar essa leitura visual.
- Fora do ataque, o herói mantém a espada erguida ao lado do corpo, com a lâmina apontando para cima; a pose horizontal projetada à frente é reservada a outras categorias de arma, não a espadas.
- O ataque básico deve permanecer curto e responsivo; sua duração fica centralizada em `GAME_CONFIG.combat.playerAttackDuration`.
- `Shift` executa uma esquiva na direção pressionada ou, sem entrada direcional, na orientação atual do herói.
- A esquiva possui duração, velocidade, invulnerabilidade e recarga próprias em `GAME_CONFIG.combat`. Ela respeita as mesmas colisões do movimento normal e não pode cancelar um ataque já iniciado.
- Esses timers são estado transitório da sessão e nunca entram no save.

## Extensão segura

- Novo conteúdo: adicionar definições em `data.js`, sem lógica ou DOM.
- Nova estatística equipada: agregá-la em `calculateStats` e consumi-la pelo resultado derivado.
- Nova progressão: persistir somente o dado irredutível em `player.progression`; não salvar valores calculáveis.
- Mudança de schema: incrementar `GAME_CONFIG.save.schemaVersion` e adicionar uma etapa em `migrateVersionedState`.
- Novo ator procedural: manter pose/arma/animação separadas do estado persistido e desenhá-lo pelo pipeline de `drawActors`.
- Sistemas de forja, loot e chefes devem operar sobre `player.inventory`, `player.equipment` e os catálogos existentes, sem criar um segundo personagem ou inventário.

## Verificação

`npm test` cobre estado inicial, validação, curva de XP, equipamentos, inventário, loot, forja, habilidades e, para caves, tabela exata de 128 abates, multiplicadores não cumulativos, IDs válidos, permanecer/avançar, espera de ameaças, invocação única, conclusão, reentrada, independência regional, loot preservado e recuperação de todos os estados críticos. O fluxo visual também recebe smoke test real no navegador após alterações em `game.js`.
