# Diário de construção

Como o Karta saiu de quatro telas estáticas para um app com IA funcionando. Cada problema que apareceu no caminho está registrado, com a causa e a solução.

## Como trabalhei com IA
- **Claude (agente de código)** escreveu o código a partir das minhas decisões de produto, explicando cada arquivo.
- **Eu** defini o escopo, escolhi entre as alternativas, rodei e testei cada etapa e julguei a qualidade das cartas geradas.
- **Gemini** é o motor do produto: gera as cartas.
- **Uma ferramenta de design com IA** gerou os mockups das telas antes do código.

---

## Origem: o projeto do Gabriel
O ponto de partida foi o [Agente_Flashcards_Mandarim](https://github.com/SanchesPinto/Agente_Flashcards_Mandarim), de **Gabriel Pinto** (fev–mar/2026): um pipeline em Python que recebe uma lista de palavras e gera um baralho do Anki.

| Projeto do Gabriel | O que o Karta herdou | O que o Karta fez diferente |
|---|---|---|
| GPT-4o-mini com saída estruturada (Pydantic) | Os 7 campos da carta: palavra, pinyin, tradução, classe, frase, pinyin da frase, tradução da frase | Gemini com schema JSON; regras de pronúncia por idioma; validação depois do modelo |
| Imagens do Pexels | O espaço para imagem na tela "Gerando" | Imagem ficou para depois |
| Voz com edge-tts (vozes neurais da Microsoft, acessadas por biblioteca da comunidade) | Áudio separado para a palavra e para a frase | Gemini TTS pela API oficial, modelos reserva e voz do navegador como último recurso |
| `.apkg` com genanki e 5 tipos de carta | A exportação para o Anki como objetivo | Ainda não feito no Karta; será escrito do zero |
| Trava de 10 palavras e 20 caracteres por lote (controle de custo) | — | Limites tratados também na resposta: cota, sobrecarga e tempo limite |
| Script de terminal, só mandarim | — | App web com 5 idiomas, biblioteca, modo estudo e repetição espaçada |

O código dele continua neste repositório, em [`v1-python/`](../v1-python), com o histórico de commits original. **Nenhuma linha de código foi reaproveitada:** o projeto do Gabriel é Python e o Karta é JavaScript, escrito do zero. Os mockups do Karta foram desenhados a partir do pipeline dele, por isso o escopo é o mesmo.

---

## Dia 0: os mockups
Eu tinha quatro telas desenhadas a partir do pipeline do Gabriel (Biblioteca, Gerando, Baralho, Estudo) e nenhuma lógica: os dados estavam escritos à mão no HTML. Antes de publicar, avaliei o material contra o que eu queria mostrar e concluí que mockup não prova que eu sei construir produto com IA. Decidi construir o app de verdade, usando os mockups como especificação visual ([docs/design](design)).

## Dia 1 (08/11): escopo e arquitetura
| Pergunta | Decisão | Por quê |
|---|---|---|
| Qual IA? | Gemini | Camada gratuita, texto e voz no mesmo provedor |
| Qual escopo? | Texto, estudo, áudio e exportação para o Anki. Imagem fica para depois | Áudio ajuda mais no estudo de idioma do que imagem, e é menos um ponto de falha |
| Precisa de backend? | Não: uma rota `/api` do Next.js | Vira função serverless; guarda a chave da API fora do navegador |
| Banco de dados? | Não: `localStorage` | MVP sem login. Limite aceito: os dados ficam num navegador |

**A engenharia de prompt** ([lib/prompt.js](../lib/prompt.js)) foi pensada em três camadas:
1. **Instrução de sistema** com regras de qualidade. A mais importante: a frase de exemplo não pode usar palavras mais difíceis que o nível pedido. Sem essa regra, o modelo escreve frases bonitas que o aluno não consegue ler.
2. **Regras por idioma** vindas de um arquivo de configuração (pinyin com marca de tom, hiragana com romaji, fonética IPA). Telas e prompt leem do mesmo arquivo, então nunca ficam fora de sincronia.
3. **Saída estruturada:** um schema JSON obriga o formato da resposta. E como o schema garante o formato, mas não a qualidade, [lib/validar.js](../lib/validar.js) descarta cartas repetidas ou incompletas.

## Dia 2 (14/11): as telas e o primeiro teste real
As quatro telas do mockup viraram componentes. Entrou a repetição espaçada ([lib/repeticao.js](../lib/repeticao.js)): errou, a carta volta na mesma sessão; acertou com segurança, o intervalo cresce 2,5×. Com 7 dias de intervalo, a carta conta como dominada. A lógica foi testada isoladamente antes de ir para a tela.

No primeiro teste com a API, nada funcionou. Seis problemas, em sequência:

| # | Sintoma | Causa | O que mudou no projeto |
|---|---|---|---|
| 1 | `npm install` falhou | Rodei na pasta errada | Nada. Erro meu, resolvido em segundos |
| 2 | Chave começava com `AQ.`, não `AIza` | O Google mudou o formato das chaves | Nada: o formato novo funciona. Confirmei antes de culpar a chave |
| 3 | "O Gemini não respondeu como esperado" | Minha mensagem de erro genérica escondia a causa | Erros classificados por tipo (chave, modelo, limite, sobrecarga) e detalhe técnico visível na tela |
| 4 | Erro 404 | `gemini-2.5-flash` foi aposentado para contas novas, mesmo aparecendo na lista de modelos | Script `npm run diagnostico`. Como o nome do modelo estava em configuração, a troca foi uma linha |
| 5 | Erro 503 com o modelo novo | Sobrecarga no Google | Novas tentativas com espera crescente (1 s, 2 s) e uma lista de modelos reserva |
| 6 | Todos os modelos novos sobrecarregados, mais `fetch failed` | Pico de demanda e instabilidade de rede no WSL | O diagnóstico passou a medir os modelos em paralelo e sugerir a configuração. Um modelo levou 267 s, então entrou um limite de 30 s por chamada |

**Resultado:** baralho de mandarim HSK 2 gerado com pinyin correto e frases no nível, e o modo estudo funcionando.

**O que aprendi:** num produto que depende de um modelo de terceiros, o modelo é uma peça que muda sem aviso. Ele é aposentado, fica sobrecarregado, demora. Por isso o app precisa de nome de modelo em configuração, erro explicado, plano B e um jeito rápido de diagnosticar.

---

## Próximas etapas
- [ ] Áudio de cada carta (Gemini TTS, com a voz do navegador como plano B)
- [ ] Exportação `.apkg` para o Anki
- [ ] Deploy no Vercel
