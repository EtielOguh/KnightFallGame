# KnightFall — relatório de refinamento

Data da rodada: 27 de outubro de 2026.

## Como os números foram obtidos

`js/simulation.js` executa uma aproximação determinística da primeira caverna. A mesma semente produz a mesma sequência de loot, dano evitado e decisões econômicas. O modelo reutiliza as definições reais de encontros, recompensas, XP, inventário, equipamento e forja, e varia apenas hipóteses de comportamento: precisão, cadência de ataque, esquiva, exploração e frequência de retorno à vila.

Os números abaixo usam 250 execuções por perfil, sementes sequenciais iniciadas em `41021`. Eles são resultados de modelo, não telemetria de jogadores e não garantem duração real. Os marcos de 0–30 minutos são hipóteses para testes de usabilidade.

Execute novamente com:

```sh
npm run simulate:balance -- --seed 41021 --runs 250
```

## Principais indicadores

| Indicador, jogador padrão | Antes | Depois |
| --- | ---: | ---: |
| Conclusão da Caverna Sombria | 100% | 100% |
| Nível médio ao concluir | 10 | 9 |
| Tempo médio por inimigo | 13,38 s | 13,88 s |
| Ouro ganho / gasto | 1.774 / 491 | 1.775 / 714 |
| Mortes médias | 3,00 | 1,67 |
| Primeira recompensa | 0:08 | 0:08 |
| Primeiro nível ou melhoria | 2:42 | 3:58 |
| Primeira troca de equipamento | 7:58 | 7:10 |
| Primeiro reforço | 15:37 | 14:48 |
| Primeiro elite | 24:13 | 23:23 |
| Rei Goblin: tempo / risco de vida | 24,74 s / 36,9% | 25,39 s / 39,9% |

Depois do ajuste, as medianas do perfil padrão ficam dentro das cinco janelas propostas. Em 250 execuções, 83,6% fizeram a primeira troca de equipamento na janela e 94,8% fizeram o primeiro reforço nela. As outras três metas atingiram 100% no modelo.

O perfil padrão precisou de mediana de 4 combates para o primeiro nível e 21,67 combates para terminar (incluindo novas tentativas). Registrou 19,78 eventos de melhoria, sendo 6,86 trocas de equipamento e 1,92 reforços. Assim, tempo de exploração e frequência de progressão podem ser avaliados separadamente.

Perfis são deliberadamente diferentes. O experiente chega aos marcos antes das janelas e não morre no modelo; o cauteloso registra 92% de conclusão, 4,02 mortes e chega ao primeiro elite em 30:06. Isso sugere validar a duração de deslocamento e recuperação com jogadores cautelosos, sem enfraquecer imediatamente o combate para todos.

## Ajustes de progressão e economia

- XP inicial passou de base 70 para 120. A curva continua multiplicativa em 1,42, limitada por teste de regressão para não superar 1,45 entre níveis nesta faixa.
- Espada curta, capacete e botas agora custam 72, 65 e 55 moedas. Nenhum equipamento ou melhoria permanente relevante pode ser comprado com as 35 moedas iniciais.
- Melhorias permanentes começam em 65/70 moedas e crescem de forma linear por compra, evitando um salto exponencial oculto.
- O primeiro reforço custa 30 moedas e 2 minérios. Os custos de ouro de +1 a +10 agora são estritamente crescentes; antes, +2 custava menos que +1.
- O perfil padrão termina com cerca de 1.775 moedas ganhas e 714 gastas. A sobra mantém liberdade para consumíveis e escolhas de peças sem tornar a forja gratuita.
- A diferença simulada entre o início e a conclusão é de nível 1 para 9; a amostra padrão termina com espada de ferro +3. Esse crescimento combina níveis, equipamento e compras, em vez de depender de uma única curva exponencial.

## Qualidade visual e de interface

O ataque básico mantém os 0,32 s definidos para o combate, mas agora possui três fases visuais: antecipação com a empunhadura elevada, corte descendente e recuperação. A mão é desenhada no mesmo sistema de transformação da espada, e um antebraço conecta ombro e empunhadura. Isso elimina o efeito de arma flutuante e reduz cruzamentos do braço com o tronco nas quatro direções.

Goblins com arma corpo a corpo passam a assumir a pose inicial do golpe durante a sinalização. Antes, a arma podia saltar da pose neutra diretamente para o arco de ataque. Escala corporal e pontos de ancoragem continuam constantes entre idle, caminhada, antecipação e ataque.

A interface conserva feedback já existente e de baixo ruído: números flutuantes para dano/cura, partículas curtas, toast de ação, resumo de XP/ouro/loot por encontro e efeito próprio da forja. O resumo trata mochila cheia sem esconder recompensas. No layout estreito, botões de fechar agora têm alvo de toque de 44 × 44 px. A revisão estática não encontrou erros ou avisos estruturais; as sugestões informativas restantes são principalmente cores literais do tema existente.

## Auto-farm: avaliação, sem implementação

Nenhuma automação foi ligada ao jogo neste ciclo. O repositório já contém funções antigas de estimativa offline em `progression.js` e campos normalizados de save, mas elas não estão conectadas à interface nem ao loop atual.

Opções para um ciclo futuro:

1. **Repetição de andar concluído com presença do jogador.** Mantém o combate visível e reduz deslocamento. Risco moderado de transformar o melhor andar em única atividade ótima.
2. **Expedição offline limitada por bilhetes/tempo.** Ajuda jogadores com sessões curtas. Exige snapshot transacional, limites de inventário e recompensas abaixo do combate manual para não invalidá-lo.
3. **Conclusão instantânea de conteúdo dominado.** É a opção mais previsível para balancear, mas deve liberar somente após prova clara de domínio e ter teto diário ou custo real de oportunidade.
4. **Combate totalmente automático em tempo real.** Tem o maior custo de IA/interface e o maior risco de remover esquiva, habilidade e leitura de sinais — justamente o núcleo atual.

Recomendação: não ativar auto-farm antes de obter telemetria manual sobre abandono, repetição voluntária de andares, consumo de poções e tempo parado na vila. Se necessário, testar primeiro a conclusão limitada de andares já dominados, com rendimento inferior ao manual.

## Verificações e próximos sinais

Os testes automatizados cobrem determinismo, variação entre sementes, metas da coorte padrão, preços iniciais, monotonicidade da forja, save/migrações, loot, regiões, combate derivado, inventário, habilidades e operações idempotentes.

No próximo ciclo, medir com jogadores reais:

- tempo ativo separado de menus e inatividade;
- causa de morte e dano recebido por arquétipo;
- andar de abandono e quantidade de tentativas do chefe;
- tempo até equipar/vender/forjar e itens perdidos por mochila cheia;
- uso de esquiva e habilidades por acerto efetivo;
- diferença entre usuários de teclado e toque.

Esses dados devem recalibrar as hipóteses; não devem ser usados para acelerar automaticamente todo jogador até as medianas simuladas.
