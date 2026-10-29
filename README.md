# KnightFall — RPG 2D

RPG de fantasia sombria para navegador, feito com HTML, CSS, Canvas e JavaScript puro.

## Executar

Como o projeto usa módulos JavaScript, inicie um servidor local na pasta do projeto:

```sh
python3 -m http.server 8000
```

Depois acesse `http://localhost:8000`.

Não há dependências de produção nem processo de build.

## Como jogar

- `WASD` ou setas: movimentar o herói
- `Espaço`: atacar
- `Shift`: esquivar na direção do movimento ou da orientação atual
- `E`: interagir com o mercador, entrar na caverna ou sair dela
- `Q`: usar uma poção de cura
- `I`: abrir ou fechar inventário e equipamentos
- `F`: abrir a forja enquanto estiver na vila
- `K`: abrir habilidades e maestria
- `R`: abrir o mapa de regiões na vila
- `1`, `2` e `3`: Golpe Poderoso, Corte Giratório e Investida
- `M`: abrir o mercador enquanto estiver na clareira
- `Esc`: fechar painéis

Na Clareira do Corvo, fale com Bram para comprar poções, recuperar vida, treinar atributos, comprar equipamentos e vender/reciclar peças da mochila. Itens comuns retornam principalmente moedas; raridades superiores também recuperam materiais de forja. Os treinos possuem limite de oito compras por atributo e saves antigos acima do limite conservam todo o poder adquirido.

Cada incursão possui dez andares. Ao cumprir a meta dos andares 1–9, o HUD oferece `Avançar` ou `Permanecer`; permanecer reativa o farm sem reiniciar a meta e o avanço continua acessível. No andar 10, vinte mortes comuns interrompem novos spawns, as ameaças restantes precisam ser derrotadas e então o Boss surge uma única vez. Após a vitória, o jogador pode recolher itens e sair quando desejar. Uma nova entrada começa outra incursão no andar 1. A primeira vitória contra o Rei Goblin libera o Bosque das Cinzas.

## Sistemas

- Mundo 2D desenhado em Canvas, com vila, mercador, caverna e Bosque das Cinzas
- Personagens pixelados desenhados e animados inteiramente por código
- Movimento em oito direções com teclado e controles de toque
- Combate em tempo real com golpe descendente de espada, esquiva, dano, defesa, invulnerabilidade breve e poções
- Habilidades ativas com vigor, cooldown, fases sincronizadas e efeitos procedurais
- Pontos de habilidade em níveis alternados, requisitos de nível/maestria, passivas de guerreiro e maestria de espadas por acertos efetivos
- Regiões com desbloqueio configurável, progresso independente e retorno seguro à vila
- Incursões repetíveis de 10 andares, 128 eliminações comuns, ondas de 2–6 ameaças e estados explícitos
- Farm contínuo opcional em andar concluído, com avanço posterior no próprio HUD
- IDs, mortes, recompensas e projéteis independentes por inimigo, com limites de entidades configuráveis
- Bosque das Cinzas completo com 10 estágios, identidade visual, obstáculos e inimigos próprios
- Goblins comuns, rápidos, guerreiros, arqueiros, arremessadores de pedra e elites com IA por estados, navegação A*, projéteis e desvio de obstáculos
- Rei Goblin procedural com três padrões, fase 2, barra de chefe e prêmio único de primeira vitória
- Recompensas em ouro, XP e loot protegidas contra concessão duplicada
- Forja de +0 a +10 com minério, aço, essência goblin, seiva corrompida, cinza viva e cristal raro
- Compra, venda e reciclagem de equipamentos usando a moeda, os materiais e o inventário canônicos
- Inventário responsivo, comparação, itens novos e seis slots de equipamento
- Cinco raridades e atributos de equipamento aplicados diretamente ao combate
- Ícones e camadas vestidas de arma, capacete, peitoral e botas desenhados proceduralmente
- Persistência automática no `localStorage`, incluindo incursão ativa, andar, estado, metas e Boss
- Interface responsiva, tela cheia e opção de som

## Estrutura

```text
index.html          HUD, painéis e diálogos
style.css           direção visual e layout responsivo
js/game.js          loop, input, arte procedural, combate e IA
js/data.js          catálogos e configuração central de balanceamento
js/dungeon.js       regiões, estágios, desbloqueios e recompensas de encontro
js/farm.js          runtime de ondas, respawn, IDs e projéteis por proprietário
js/forge.js         reforço, custos, compra e venda atômicos
js/skills.js        habilidades, recursos, passivas e maestria
js/state.js         estado raiz, normalização e validação
js/player.js        personagem, inventário, equipamentos e atributos
js/loot.js          rolagem pura e testável das recompensas
js/progression.js   XP, níveis, domínio e simulações
js/simulation.js    simulação determinística de progressão e economia
js/save.js          save versionado e migrações
js/music.js         áudio procedural
scripts/            ferramentas de auditoria e balanceamento
tests/              verificações automatizadas dos sistemas críticos
```

Veja [ARCHITECTURE.md](ARCHITECTURE.md) para o mapa completo, fontes de verdade e regras de extensão.

## Testes

```sh
npm test
npm run simulate:balance -- --seed 41021 --runs 250
```

Os testes usam apenas o executor nativo do Node.js.
Os resultados da simulação são hipóteses reproduzíveis de balanceamento, não dados reais de jogadores. Veja [BALANCE_REPORT.md](BALANCE_REPORT.md) para metodologia, comparação e avaliação de auto-farm.

## Atalhos de desenvolvimento

No console do navegador:

```js
KnightFallDebug.enterCave()
KnightFallDebug.enterRegion("bosque_cinzas")
KnightFallDebug.unlockRegion("bosque_cinzas")
KnightFallDebug.exitCave()
KnightFallDebug.addCoins(100)
KnightFallDebug.enemy()
KnightFallDebug.encounter()
KnightFallDebug.setFloor(10)
KnightFallDebug.completeFloorObjective()
KnightFallDebug.damageEnemy(100)
KnightFallDebug.stats()
KnightFallDebug.openInventory()
KnightFallDebug.openForge()
KnightFallDebug.addSkillPoints(5)
KnightFallDebug.setPlayerLevel(3)
KnightFallDebug.learnSkill("golpe_poderoso")
KnightFallDebug.useSkill("golpe_poderoso")
KnightFallDebug.addForgeResources(50)
KnightFallDebug.addItem("espada_curta")
KnightFallDebug.state()
```
