# KnightFall — relatório do primeiro pacote de farm

Data da rodada: 27 de outubro de 2026.

## Metodologia

`js/simulation.js` usa semente controlada e as tabelas reais de HP, dano, XP, loot, inventário, equipamento e forja. O modelo agora percorre as metas de abate, gera composições pelo orçamento de ameaça e contabiliza ondas, retornos táticos, mortes e progressão. Ele aproxima decisões de um jogador; não é telemetria e médias não garantem uma recompensa individual.

Comando reproduzível:

```sh
npm run simulate:balance -- --seed 41021 --runs 250
```

Os valores “antes” foram registrados no baseline imediatamente anterior ao pacote. O modelo anterior simulava apenas um encontro por andar; por isso volume total, ouro total e duração não são comparações equivalentes. TTK, risco, nível final e marcos ainda são úteis como referência.

## Indicadores do perfil padrão

| Indicador | Baseline de 20 encontros | Farm v7, 250 execuções |
| --- | ---: | ---: |
| Conclusão da Cave 1 | 100% | 100% |
| Abates/vitórias médios | 20 | 259 obrigatórios; 261,52 tentativas |
| Nível médio ao concluir | 9,00 | 9,84 |
| Tempo médio por inimigo | 13,88 s | 9,57 s |
| Mortes médias | 1,67 | 2,52 |
| Ouro ganho / gasto | 1.775 / 714 | 5.300 / 2.305 |
| Ouro médio por minuto | não medido | 75,44 |
| Primeira recompensa | 0:08 | 0:07 |
| Primeiro nível/melhoria | 3:58 | 4:43 |
| Primeira troca de equipamento | 7:10 | 7:01 |
| Primeiro reforço | 14:48 | 16:53 |
| Primeira ameaça elite | 23:23 | 39:00 |
| Rei Goblin: TTK / risco de vida | 25,39 s / 39,9% | 23,25 s / 32,9% |

A chegada à faixa elite foi conscientemente recalibrada para uma hipótese de 35–50 minutos. A meta antiga de 20–30 minutos era compatível com um inimigo por andar, mas não com 122–151 abates até a faixa avançada. Em 250 execuções, 99,6% do perfil padrão ficaram nessa nova janela. A hipótese deve ser validada com jogadores reais antes de reduzir metas.

## Parâmetros implantados

- Andares 1–4: 5, 6, 7 e 8 abates.
- Andares 5–9: 8, 9, 10, 11 e 12 abates.
- Andares 10–14: 12, 14, 15, 16 e 18 abates.
- Andares 15–19: 18, 20, 21, 23 e 25 abates.
- Andar 20: uma vitória para o objetivo; chefe e recompensa repetível continuam disponíveis.
- Ondas: 2–4 posições planejadas, teto ativo de 2/3/3/4 e orçamento de ameaça por faixa.
- Navegação: no máximo dois novos cálculos A* por quadro e replanejamento entre 0,42–0,68 s.
- Projéteis: teto de 24 na Cave 1 e `ownerId` obrigatório.
- Treino de Bram: oito compras futuras de ataque e oito de defesa. Saves acima disso não perdem atributos.

O XP comum foi reduzido porque agora há muitos inimigos por andar. Guerreiro, arqueiro e elite continuam aumentando a eficiência de XP/min, enquanto o chefe mantém XP relevante e prêmio único separado. A curva global de nível não foi alterada.

## Economia e drops

O loot continua individual e usa as tabelas já existentes: minério e consumível no início, aço/essência e equipamento nas faixas seguintes, cristal raro nas elites/chefe. A coorte padrão encontrou em média 14,63 equipamentos e 97,43 materiais ao concluir os objetivos; esses números são altos o bastante para exigir observação de inventário cheio e consumo na forja no próximo ciclo.

Não foram implementados sets completos, fragmentos garantidos, desmontagem, crafting ou falha de forja. A estrutura de recompensa permanece extensível, mas nenhuma probabilidade futura foi inventada sem simulação.

## Desempenho observado

Smoke test no navegador, com horda e Canvas ativos, mediu 181 quadros em 3,007 s: 60,2 FPS estimados, quadro médio de 16,61 ms e p95 de 17,60 ms. É uma medição local curta, não um benchmark universal. Entidades mortas, partículas e projéteis continuam sendo removidos; resultados recentes ficam limitados a 30 e a proteção de IDs de recompensa a 512 por sessão.

## Riscos e próximos sinais

- O modelo não representa domínio de esquiva, uso perfeito de habilidades nem tempo ocioso real.
- A chance atual de loot aplicada a 259 abates pode encher a mochila; medir itens perdidos e frequência de retorno.
- O lucro de 75,44 ouro/min precisa ser comparado ao consumo real de poções, forja e futuras refinarias.
- A primeira faixa elite em aproximadamente 39 minutos pode ser longa para jogadores novos, embora esteja coerente com o objetivo de farm prolongado.
- O Bosque das Cinzas mantém seu fluxo anterior de encontro único; o farm contínuo foi explicitamente limitado à Cave 1 neste pacote.

Próximo ciclo recomendado: telemetria local opcional de duração ativa, dano por arquétipo, abandono por andar, poções, loot perdido e tempo de retorno. Só depois disso devem ser definidos sets do Rei Goblin, fragmentos contra azar e reciclagem de duplicatas.
