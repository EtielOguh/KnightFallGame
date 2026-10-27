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

`terminal.js` pertence à interface textual anterior e não é carregado. Ele permanece no repositório apenas como referência enquanto funcionalidades úteis da versão anterior são adaptadas. Nenhuma regra do jogo Canvas depende dele.

## Resultado da auditoria

Antes da consolidação, `game.js` mantinha sozinho um personagem plano, áudio Web Audio e o save `knightfall.visual.v1`. Em paralelo, os outros módulos descreviam outro personagem, outro inventário e o save `ecosDoAbismo.save`; nenhum deles era importado pelo HTML.

Foram reaproveitados:

- os catálogos de regiões, inimigos, itens, conjuntos e habilidades de `data.js`, ativados gradualmente pelas interfaces atuais;
- a curva de progressão, domínio de armas e simuladores de `progression.js`, agora ligados ao mesmo modelo de jogador;
- as instâncias de inventário com `uid`, níveis de equipamento e slots da camada antiga;
- o sintetizador procedural de `music.js`;
- os dois formatos de save anteriores, agora tratados como fontes de migração.

Foram removidas da execução as duplicações de `freshState`, `nextXp`, contador isolado de poções, atributos `damage/armor` concorrentes, acesso direto ao `localStorage` e segundo contexto de áudio em `game.js`.

Permanecem intencionalmente inativos, mas reutilizáveis, o conteúdo avançado de `data.js` e as rotinas de treino/auto-farm de `progression.js`. `terminal.js` é código legado de apresentação e não deve voltar ao grafo do jogo Canvas.

## Responsabilidades

| Módulo | Responsabilidade | Não deve conter |
| --- | --- | --- |
| `game.js` | Sessão em tempo real, movimentação, colisão, A*, combate, NPC Bram, input, HUD e renderização procedural | Formato de save, modelo alternativo de jogador ou números centrais de balanceamento |
| `data.js` | Catálogos futuros e `GAME_CONFIG` | Mutação de estado e acesso ao DOM |
| `state.js` | Criação, normalização, validação e snapshot seguro do estado raiz | Renderização e `localStorage` |
| `player.js` | Modelo do personagem, inventário, equipamentos e cálculo único de atributos efetivos | HUD, IA ou persistência |
| `progression.js` | Curvas de XP, level-up, domínio e simulações | Estado global |
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
│   │       └── uniqueRewardsClaimed
│   └── bossesDefeated          legado neutralizado; não é fonte de gameplay
├── settings                    áudio
├── systems                     sessões futuras/legadas
├── flags
└── metadata
```

Valores efetivos de combate nunca são copiados para a interface. `calculateStatBreakdown(player, temporários)` separa base, equipamento e modificadores temporários; `calculateStats` devolve apenas o total. A HUD, o dano, a defesa, a velocidade e o inventário consultam essas mesmas funções. Equipar apenas troca o `uid` referenciado no slot, portanto repetir a operação nunca acumula bônus.

### Habilidades e maestria

`SKILLS` em `data.js` é a fonte única de requisitos, níveis máximos, custos em pontos, cooldowns, vigor, fases e efeitos. `player.skillProgression` guarda apenas classe, pontos e níveis aprendidos; `player.resources` guarda o vigor. Cooldowns e a habilidade em execução pertencem a `skillRuntime` em `game.js` e não entram no save.

As técnicas usam as fases `anticipation`, `active`, `recovery` e `complete`. A esquiva pode cancelar somente `anticipation`; o vigor permanece gasto e o cooldown continua. Depois da janela ativa começar, movimento, ataque básico e outras habilidades permanecem bloqueados até a recuperação terminar. Receber dano não cancela a técnica. Cada execução mantém `hitTargets`, garantindo um único dano por alvo e evento.

`Golpe Poderoso` usa cone frontal, `Corte Giratório` usa raio próximo e `Investida` desloca o jogador pelas mesmas colisões de cenário do movimento normal, até seu alcance máximo. A arte dessas ações é desenhada no Canvas com poses de espada próprias para antecipação, movimento e recuperação.

A maestria identifica o tipo da arma equipada e recebe experiência apenas em `applyPlayerDamage`, após dano positivo. IDs de evento impedem repetição e cada inimigo possui teto configurável em `GAME_CONFIG.skills.masteryTargetCap`. O multiplicador de maestria e `Treinamento Marcial` entram no cálculo final do dano; `Resistência` entra uma única vez no bloco `passive` do cálculo de atributos.

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

`forge.js` valida a operação inteira antes de alterar recursos. Reforço, compra e venda aceitam um identificador de transação para rejeitar reenvios na mesma sessão. A interface também bloqueia o botão enquanto a operação está sendo confirmada e grava o save imediatamente após o sucesso. Itens equipados não podem ser vendidos. O valor de uma peça reforçada recupera uma fração configurável do investimento por meio de `calculateSalePrice`.

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

## Caverna Sombria

`GAME_CONFIG.firstCave` é a fonte única das 20 etapas e do farm contínuo. `farm.unlockKills` define a meta de cada andar; `farm.bands` define tamanho da onda, teto ativo, orçamento de ameaça e pesos de papéis; `farm.roles` aplica variações comum, rápida, resistente, distante e elite sem duplicar a IA. `createWavePlan` e `createEncounterSpec` transformam esses dados em ondas e atores.

- 1–5: comuns, perseguição e corte simples;
- 6–10: guerreiros, golpe amplo e recuperação mais longa;
- 11–15: arqueiros, distância preferida, recuo e projétil com colisão;
- 16–19: elites, golpe pesado e investida sinalizados;
- 20: Rei Goblin, golpe pesado, investida, área, fase 2 e animação de derrota.

A IA usa os estados `patrol`, `chase`, `telegraph`, `attack`, `recover`, `hurt` e `dying`. A navegação mantém linha direta, A* e deslizamento por obstáculos. O orçamento de A* limita recálculos por quadro e cada ator recebe um intervalo de replanejamento; separação física impede empilhamento. Todo ataque perigoso passa por `telegraph`; a direção é travada no começo da preparação para oferecer uma janela real de reação.

Ao morrer, somente o inimigo recebe a trava de recompensa antes de XP, moedas e loot. O abate é salvo antes do fim da animação; matar outro ator não apaga seus projéteis nem encerra a sessão. Ao atingir a meta, o próximo andar é desbloqueado, mas `selectedFloor` não muda: o jogador permanece farmando até sair e escolher outro andar no mapa. O Rei Goblin reaparece após uma pausa, contabiliza vitórias repetíveis e mantém a recompensa única protegida. As metas provisórias são 5–8, 8–12, 12–18 e 18–25 abates nas quatro faixas, mais uma vitória no andar 20.

## Regiões e Bosque das Cinzas

`GAME_CONFIG.regions` é o catálogo de navegação. Cada entrada define nome, ordem, faixa de nível, estado (`playable` ou `planned`), chave de configuração e requisito de desbloqueio. `regionUnlockStatus` interpreta essas regras sem condições espalhadas pelo loop. O mapa permite revisitar qualquer região jogável desbloqueada.

Cada região possui um registro próprio em `world.regionProgress`; selecionar outra região nunca copia ou reinicia o progresso anterior. A antiga `world.caveProgress` é aceita somente pela migração e convertida para `regionProgress.caverna_sombria`. O runtime mantém a cena interna `cave` por compatibilidade, mas cenário, obstáculos, encontros, loot e chefe vêm de `currentRegionId`.

O Bosque das Cinzas é a segunda região completa, desbloqueada por `regionProgress.caverna_sombria.bossVictories`. Seus dez estágios continuam com o fluxo anterior de um encontro e avanço explícito; o farm contínuo deste pacote está habilitado somente em `firstCave.farm.continuous`. Isso evita expandir ou rebalancear antecipadamente a segunda região. Montanhas do Lamento, Catacumbas Esquecidas e Fortaleza do Eclipse permanecem apenas no catálogo.

## Save e migração

O formato atual usa a chave `knightfall.save`, envelope versão 7:

```json
{
  "game": "KnightFall",
  "version": 7,
  "savedAt": "ISO-8601",
  "state": {}
}
```

A leitura tenta, nesta ordem:

1. `knightfall.save`;
2. `knightfall.visual.v1`, usado pelo protótipo Canvas;
3. `ecosDoAbismo.save`, usado pela interface textual antiga.

Cada formato possui migração explícita antes de `normalizeGameState`. A versão 7 converte `currentExpeditionFloor` em `selectedFloor`, cria abates e objetivos por andar e reconhece como concluídos todos os andares que um save antigo já havia desbloqueado. `bossesDefeated` antigo é importado para `bossVictories` da região correspondente e depois neutralizado, eliminando a fonte duplicada. Nível, XP, moedas, inventário, UIDs, equipamento e reforços são preservados. Valores inválidos são limitados e saves futuros são recusados.

O snapshot sempre retorna o personagem à Clareira ao continuar, preservando a regra anterior de não restaurar uma luta no meio.

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

`npm test` cobre estado inicial, validação, curva de XP, equipamentos, inventário, loot, forja, habilidades, cooldown, vigor, fases, colisões, passivas, proteção da maestria, persistência e migração. O fluxo visual e os controles também recebem smoke test no navegador após alterações em `game.js`.
