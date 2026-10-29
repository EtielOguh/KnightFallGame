# KnightFall — relatório da incursão de 10 andares

Data da rodada: 29 de outubro de 2026.

## Metodologia

`js/simulation.js` usa semente controlada e as tabelas reais de HP, ataque, defesa, XP, loot, inventário, loja e forja. Cada execução percorre os 128 abates comuns e tenta o Rei Goblin. O modelo aproxima precisão, cadência, esquiva, pressão de onda, retornos táticos e decisões de melhoria para três perfis.

Os resultados são hipóteses reproduzíveis, não telemetria. Médias não garantem drops, vitória ou tempo individual.

```sh
npm run simulate:balance -- --seed 41021 --runs 250
```

## Resultado atual — 250 execuções por perfil

| Indicador | Padrão | Habilidoso | Cauteloso/subequipado |
| --- | ---: | ---: | ---: |
| Conclusão da incursão | 61,2% | 100% | 0,8% |
| Nível final médio | 6,61 | 7,00 | 6,01 |
| Tempo médio por inimigo | 10,65 s | 8,33 s | 13,01 s |
| Mortes médias | 7,18 | 0,22 | 18,58 |
| Ouro ganho / gasto | 815 / 734 | 862 / 481 | 721 / 706 |
| Ouro por minuto | 19,81 | 36,74 | 12,17 |
| Equipamentos encontrados | 8,20 | 8,73 | 7,83 |
| Materiais encontrados | 63,58 | 64,12 | 61,93 |
| Rei Goblin — TTK médio das vitórias | 52,48 s | 40,79 s | 65,05 s |
| Rei Goblin — dano/vida máxima | 76,8% | 42,7% | 95,3% |

O perfil padrão conclui com frequência suficiente para validar o fluxo, mas não transforma o chefe em vitória automática. O perfil habilidoso demonstra o valor de esquiva e precisão. O perfil cauteloso atual funciona como cenário deliberadamente subequipado; sua taxa muito baixa é um risco a observar em playtest humano, sobretudo para futuras classes que ainda não existem na execução atual.

## Marcos do perfil padrão

| Marco | Mediana | Hipótese atual |
| --- | ---: | ---: |
| Primeira recompensa | 0:07 | 0–3 min |
| Primeiro nível/melhoria | 4:03 | 3–7 min |
| Primeira troca de arma | 9:23 | 7–12 min |
| Primeiro reforço | 23:31 | 20–30 min |
| Primeira elite | 24:29 | 20–30 min |

A nova rota tem exatamente 128 eliminações comuns. O primeiro reforço foi movido para a hipótese de 20–30 minutos porque a economia vigente exige uma troca relevante antes de investir materiais; isso deve continuar sendo validado em jogo real.

## Parâmetros da cave

- Metas: `8, 9, 10, 11, 12, 13, 14, 15, 16, 20`.
- Ondas: 2–3 nos andares 1–2; 3–4 nos 3–5; 4–5 nos 6–8; 5–6 nos 9–10.
- Limite simultâneo: 3, 3, 4, 4, 4, 5, 5, 5, 6 e 6.
- Multiplicadores finais do andar 10: vida 2,65×, ataque 2,00× e defesa 1,35×.
- Rei Goblin: 1.200 HP, 40 de ataque e 5 de defesa. Contra o inimigo-base comum do andar 10, isso representa aproximadamente 5,2× vida, 1,43× ataque e 1,25× defesa.

O chefe manteve seus padrões, segunda fase e tabelas de recompensa. Somente seus atributos foram alinhados à referência de poder da nova progressão; com 2.800 HP/65 ataque, a simulação anterior desta rodada produziu 0% de conclusão padrão. A primeira correção para 1.850/42 ainda produziu apenas 7,5%. O valor atual chegou a 61,2% sem alterar loot.

## Auditoria de loot dos chefes

As probabilidades ativas foram preservadas e agora possuem teste de regressão exato.

Rei Goblin:

- Poção maior: 35%; Anel de Vitalidade: 6%; Amuleto do Vigia: 7%.
- Fragmento de Aço: 65%; Essência Goblin: 100%; Cristal Raro: 16%.
- Primeira vitória: Coroa do Rei Goblin, 220 XP e 80 moedas, uma única vez.

Cervo-Rei Putrificado:

- Seiva Corrompida: 100%; Cinza Viva: 100%; Lâmina das Cinzas: 22%; Cristal Raro: 20%.
- Primeira vitória: Coroa do Cervo, 300 XP e 190 moedas, uma única vez.

`rollLoot` permite várias rolagens independentes de consumíveis/materiais, mas no máximo um equipamento por inimigo. A camada Canvas ativa contém somente o guerreiro e as peças acima nessas tabelas. O catálogo legado possui definições adicionais de sets/classes, porém elas não foram conectadas porque isso modificaria o loot que esta rodada exige preservar integralmente.

## Validação

- 57 testes automatizados aprovados.
- Coortes determinísticas de 250 execuções para três perfis.
- Smoke test no Chromium: novo jogo, incursão, conclusão do andar, permanecer, avanço, 20/20, Boss pendente/ativo, morte e reentrada, vitória, saída e nova incursão.
- Console do navegador sem erros ou avisos.

Riscos: a simulação não representa comportamento humano real; o perfil cauteloso está excessivamente punitivo; e Archer, Thief e Mage ainda não existem no runtime, portanto balanceamento multiclasse não pode ser validado sem inventar sistemas fora do escopo. O próximo ciclo deve coletar telemetria local de tempo ativo, dano recebido, mortes por andar e tentativas de chefe antes de novo ajuste numérico.
