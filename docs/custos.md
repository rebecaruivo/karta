# Quanto custa cada transação

O Karta mede em dinheiro quanto custa cada coisa que faz com IA: criar um baralho, gerar uma palavra, gravar um áudio, analisar o progresso. O número aparece no painel de admin (`/painel`, seção "Quanto custa cada transação").

## Como o custo é calculado

1. **Tokens reais.** Toda resposta do Gemini traz `usageMetadata`: tokens de entrada, de saída e de "pensamento". O app lê esse campo em cada chamada ([`lib/v2/custos.js`](../lib/v2/custos.js), função `usoDaResposta`).
2. **O modelo que respondeu.** O campo `modelVersion` diz qual modelo atendeu de fato. Isso importa porque `gemini-flash-lite-latest` é um apelido e a cobrança é do modelo para o qual ele aponta.
3. **Preço do plano pago.** Tokens × tabela de preços (US$ por milhão de tokens, consultada em 26/11/2026 na [página de preços da API](https://ai.google.dev/gemini-api/docs/pricing)). O pensamento é cobrado como saída, e nos modelos de voz a saída é áudio, que tem preço próprio.
4. **Modelo fora da tabela.** Usa o preço da família (o mais caro dela, por segurança) e marca o valor como **estimado**. Modelo desconhecido de todo fica sem preço (`null`), nunca zero: zero seria mentir.
5. **Reais.** Dólar a R$ 5,10 (aproximado, nov/2026), definido num lugar só (`COTACAO_USD_BRL`).

| Modelo | Etapa | Entrada | Saída |
|---|---|---|---|
| Gemini 3.5 Flash | Módulo 1 (sugerir palavras) e análise | US$ 1,50 | US$ 9,00 |
| Gemini 3.1 Flash-Lite | Módulo 2 (facetas), reserva | US$ 0,25 | US$ 1,50 |
| Gemini 3.5 Flash-Lite | Módulo 2, se o apelido apontar para ele* | US$ 0,30 | US$ 2,50 |
| Gemini 2.5 Flash TTS | Voz (reserva) | US$ 0,50 | US$ 10,00 (áudio) |
| Gemini 3.1 Flash TTS | Voz (reserva) | US$ 1,00 | US$ 20,00 (áudio) |

\* A página de preços da API não lista o 3.5 Flash-Lite. O valor vem da [tabela do Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/pricing).

**Quem paga hoje:** ninguém. Cada pessoa usa a própria chave do Gemini, na faixa grátis. Os números respondem outra pergunta: quanto custaria se o Karta pagasse a conta, que é o que decide se o produto escala.

## Onde o custo é registrado

| Transação | Evento | O que guarda |
|---|---|---|
| Criar um baralho | `baralho_criado` | custo do Módulo 1 + Módulo 2, tokens, palavras, quantas vieram do banco |
| Acrescentar ou gerar de novo | `palavras_acrescentadas` | o mesmo, para a operação de acrescentar |
| Gravar áudios | `audios_gerados` | gravações feitas e custo (a rota de voz devolve o custo no cabeçalho `X-Custo-Usd`, porque a resposta é o próprio áudio) |
| Análise do progresso | `analise_gerada` | custo da chamada |

O painel divide o custo pelo que cada transação entregou: custo de uma palavra gerada pela IA, de uma gravação, de um baralho. Também mostra o **baralho completo** (criar + 2 gravações por palavra), a projeção para 1.000 baralhos e a **economia do banco de palavras**: cada palavra reaproveitada é uma chamada que não aconteceu.

## Primeira medição: Módulo 2, 10 palavras

Medida no protótipo de 15/11 ([`scripts/prototipo-modulo2.mjs`](../scripts/prototipo-modulo2.mjs)), com os mesmos 10 palavras nos dois modelos:

| Modelo | Tokens (entrada / saída / pensamento) | Tempo | Custo das 10 palavras | Por palavra |
|---|---|---|---|---|
| Flash-Lite | 610 / 1.415 / 0 | 3,4 s | US$ 0,0023 a 0,0037 (≈ R$ 0,01 a 0,02) | ≈ R$ 0,001 a 0,002 |
| 3.5 Flash | 610 / 974 / 2.580 | 12,3 s | US$ 0,0329 (≈ R$ 0,17) | ≈ R$ 0,017 |

O Flash-Lite custa entre **9 e 14 vezes menos** que o 3.5 Flash no Módulo 2: 9 vezes se o apelido apontar para o 3.5 Flash-Lite, 14 se apontar para o 3.1. Ele também é 3,6 vezes mais rápido, com o essencial igual. A maior parte da diferença vem do "pensamento": 2.580 tokens cobrados como saída que o resultado não precisava. É por isso que o Módulo 2 usa o lite e só o Módulo 1, que errava caracteres com o lite, usa o 3.5 Flash.

## Medição completa: um baralho de ponta a ponta (26/11)

Rodada com `npm run medir:custo`: tema "frutas", mandarim HSK 2, todas as palavras geradas pela IA (sem o banco, o pior caso). Detalhes em `prototipos/custo-2026-11-26.json`.

| Etapa | Modelo que respondeu | Tokens | Custo |
|---|---|---|---|
| Módulo 1: sugerir as palavras | 3.5 Flash-Lite (reserva, ver abaixo) | 666 | US$ 0,00079 (R$ 0,004) |
| Módulo 2: facetas de 7 palavras | 3.5 Flash-Lite | 685 entrada + 634 saída | US$ 0,0018 (R$ 0,009) |
| Por palavra gerada pela IA | | | US$ 0,00026 (R$ 0,0013) |
| Uma gravação de áudio | Flash TTS* | 27 a 55 | US$ 0,00074 (R$ 0,0038) |
| **Criar o baralho** (M1 + M2) | | | **US$ 0,0026 (R$ 0,01)** |
| **Baralho completo** (+ 14 gravações) | | | **US$ 0,013 (R$ 0,07)** |
| 1.000 baralhos completos | | | US$ 13 (R$ 66) |

\* O modelo de voz configurado não está na tabela de preços, então o valor usa o TTS mais caro da tabela e fica marcado como estimado. Na prática, deve custar o mesmo ou menos.

O que a medição mostrou:

1. **A voz é 80% do custo.** As 14 gravações custam US$ 0,0104 dos US$ 0,013 do baralho completo; o texto todo (Módulos 1 e 2) custa US$ 0,0026. Por isso, a próxima economia está no áudio, não nos prompts: guardar as gravações no servidor e reaproveitá-las entre usuários, do mesmo jeito que o banco de palavras faz com o texto, cortaria a maior parte da conta.
2. **O apelido foi resolvido.** `gemini-flash-lite-latest` apontou para o **3.5 Flash-Lite**, e o preço deixou de ser estimado.
3. **O problema do Módulo 1 é o tempo, não o custo.** O 3.5 Flash passou do limite de 45 segundos e o app caiu para o modelo reserva (Flash-Lite), que respondeu, mas com 7 palavras em vez de 10 (50 s no total). O custo medido do Módulo 1 é, portanto, o do reserva; com o 3.5 Flash seria algumas vezes maior por causa do "pensamento", e ainda assim centavos. Próximo passo: limitar o pensamento do Módulo 1 (`thinkingBudget`) e medir de novo qualidade, tempo e custo.
4. **Escala.** Mil baralhos completos por mês custariam cerca de R$ 66 no plano pago. Com o banco de palavras, as palavras repetidas saem de graça.

## Como medir de novo

`npm run medir:custo` cria um baralho de verdade (sem salvar nada) com os mesmos módulos do app e mede cada etapa: Módulo 1, Módulo 2 sem o banco (o pior caso) e as duas gravações de uma palavra. O resultado fica em `prototipos/custo-AAAA-MM-DD.json`.

```bash
npm run medir:custo                                   # "frutas", 10 palavras, mandarim HSK 2
npm run medir:custo -- "no restaurante" 15 fr A2      # outro tema, quantidade, idioma e nível
```

Os testes de toda a conta estão em `npm run testar:custos`.
