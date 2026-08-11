# KnightFall

RPG de fantasia sombria para navegador, feito somente com HTML, CSS e JavaScript.

## Executar

Como o projeto usa módulos JavaScript, abra um servidor local na pasta do projeto:

```sh
python3 -m http.server 8000
```

Depois acesse `http://localhost:8000` no navegador.

Não há dependências, instalação ou processo de build.

## Estrutura

```text
index.html       estrutura da aplicação
style.css        apresentação responsiva
js/game.js       estado central, telas e regras do loop principal
js/player.js     criação e atributos do personagem
js/terminal.js   componentes visuais e navegação por teclado
js/save.js       persistência versionada no localStorage
js/progression.js constantes e fórmulas de domínio, treino e Auto Farm
```

O estado da campanha permanece independente do DOM. As telas registram apenas as ações válidas naquele momento, e a camada visual transforma cliques, atalhos e Enter na mesma entrada. O save local serializa o estado inteiro e inclui uma versão para permitir migrações futuras.

## Sistemas atuais

- Combate em turnos, energia, críticos, esquiva, vitória, fuga e derrota
- Seis regiões, com acesso por nível e criaturas próprias
- Faixas regionais de inimigos: níveis 1–2, 3–5, 6–8, 9–12, 13–16 e 17–20
- Um chefe em cada região, liberado ao seguir rastros deixados pelos inimigos
- Drops de set de chefe com chance progressiva após tentativas sem sucesso
- Experiência, níveis e desbloqueio de habilidades
- Arsenal ampliado com armas, armaduras, elmos, botas, amuletos, três categorias de poções e materiais
- Raridades comum, incomum, rara, épica e de chefe
- Sets de chefe com arma, armadura, elmo, amuleto e botas; cinco peças equipadas ativam um bônus exclusivo
- Venda de itens, valorização por raridade/evolução e proteção contra venda de equipamento ativo
- Mochila com 20 espaços base, até +20 por progressão de nível e até +20 por expansões compradas
- Evolução de equipamentos até `+5` usando moedas e materiais
- Tema de abertura e música de batalha sintetizados pelo navegador
- Indicadores visuais animados para ataques, dano e esquiva, sem efeitos sonoros de golpes
- Opção para salvar e sair ao menu principal, preservando a última região visitada
- Autosave durante exploração, viagens, equipamentos, evolução e a cada turno de batalha
- Expedições contínuas com eventos automáticos, encontros, fuga e acesso direto ao chefe
- Interface visual responsiva com cartões, transições e navegação por setas/Enter
- Domínio independente para espada, machado, lança, arco, cajado e adaga, até o nível 100
- Campo de Treinamento com sessões por timestamp e limite offline de 8 horas
- Auto Attack baseado no intervalo real da arma e nas mesmas regras do ataque manual
- Auto Farm agregado com estimativas reais, uso de poções, morte, limite da mochila e relatório

## Testes rápidos de desenvolvimento

Abra o jogo com `?debug=1`, carregue uma campanha e use no console:

```js
KnightFallDebug.training(3600, "sword")
KnightFallDebug.farm(3600, "ruinas_despertar")
KnightFallDebug.mastery("sword", 50)
```

Recarregue ou conclua a sessão pela interface para gerar o relatório. Os utilitários não são criados sem o parâmetro `?debug=1`.

## Balanceamento da automação

As constantes ficam em `js/progression.js`, no objeto `BALANCE`. Ali podem ser ajustados o limite offline, XP de treino por segundo, eficiência do Auto Farm, eficiência de domínio em combate, nível máximo de domínio, bônus de dano, curvas de XP, atraso entre encontros e taxas de poções/raridades.

Treinamento e Auto Farm não mantêm timers longos. O save guarda `startedAt`; ao retornar, o jogo calcula a diferença entre `Date.now()` e esse timestamp, rejeita valores negativos e limita o resultado a oito horas.

A música começa apenas depois de uma interação do jogador, conforme as regras de reprodução automática dos navegadores.
