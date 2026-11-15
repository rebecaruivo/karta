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
| `.apkg` com genanki e 5 tipos de carta (leitura, audição, imagem, tradução reversa, contexto) | A exportação para o Anki e **a ideia de vários tipos de cartão por palavra** | Escrito do zero em JavaScript (sql.js + JSZip), no navegador, com 3 tipos: leitura, audição e produção |
| Trava de 10 palavras e 20 caracteres por lote (controle de custo) | — | Limites tratados também na resposta: cota, sobrecarga e tempo limite |
| Script de terminal. Na branch principal, só mandarim; numa [branch de junho/2026](https://github.com/SanchesPinto/Agente_Flashcards_Mandarim/tree/feature/english-and-french-support), inglês e francês, com um arquivo de configuração por idioma (voz, nome do baralho, templates) | A mesma abordagem de configuração por idioma, que o Karta também adotou em `lib/idiomas.js` | App web com 5 idiomas, biblioteca, modo estudo e repetição espaçada |

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

## Dia 2, à tarde (14/11): áudio
**Antes de construir, medir.** Escrevi `npm run diagnostico:voz`, que testa cada modelo de voz disponível para a chave pelos dois caminhos da API e salva um `.wav` de amostra. Resultado: três modelos gratuitos funcionam pelo `generateContent`; o `2.5-pro-tts` exige plano pago; o endpoint novo (`Interactions`) exige uma versão mais nova do SDK.

**Arquitetura do áudio:**
| Decisão | Por quê |
|---|---|
| Rota `/api/voz` com modelo principal e reservas | Mesma resiliência da geração de texto. Quando a cota de um modelo acaba, passa para o próximo (cada modelo tem a sua cota) |
| PCM convertido para WAV no servidor | O Gemini devolve som "cru"; o navegador só toca com o cabeçalho de 44 bytes do WAV |
| Áudios no IndexedDB, não no localStorage | WAV ocupa ~48 KB por segundo; um baralho de 10 cartas já passa de 1,5 MB e o localStorage aguenta ~5 MB no total |
| Uma carta por vez, salvando cada áudio | Respeita o limite por minuto da camada gratuita; se o limite chegar, nada se perde |
| Voz do navegador como último recurso | A carta nunca fica muda |

**O chiado no final.** No teste, todo áudio terminava com um ruído. Medi as amostras: os modelos `2.5` e `3.1` terminavam em silêncio, mas os da família `3.8` tinham ~160 ms de chiado forte depois da fala. Lendo os bytes finais, encontrei texto no meio do som: "Google LLC", "C2PA OCSP Responder" e uma assinatura digital. Era um **certificado de procedência C2PA** (Content Credentials), que o Google anexa para provar que o áudio foi gerado por IA. Como o áudio vem cru, sem envelope de arquivo, o certificado fica colado nas amostras e é tocado como se fosse som.

A correção ([`lib/wav.js`](../lib/wav.js)) procura a marca `C2PA` seguida da caixa JUMBF (`jumb`) e corta o áudio ali: 7.664 bytes removidos nos modelos 3.8, nenhum nos outros. Para os áudios já salvos com chiado, os áudios ganharam um número de versão: quando o processo de geração muda, o app trata os antigos como desatualizados e oferece gerar de novo.

**O que aprendi:** "o modelo devolveu áudio" não quer dizer que tudo o que veio é áudio. Conferir os bytes de verdade mostrou um dado que nenhuma documentação tinha mencionado.

---

## Dia 2, à noite (14/11): exportação para o Anki
**Do zero, a partir do formato.** Um `.apkg` é um ZIP com um banco SQLite (`collection.anki2`), um mapa de mídia e os arquivos de áudio numerados. Antes de escrever, abri um `.apkg` real para estudar o formato: tabelas, modelo, baralho e configurações padrão do Anki. Estudar o arquivo gerado não é reaproveitar código.

| Decisão | Por quê |
|---|---|
| Gerar no navegador, com sql.js (SQLite em WebAssembly) e JSZip | Os áudios já estão no IndexedDB do navegador; mandar tudo ao servidor seria lento e desnecessário |
| sql.js carregado de `public/`, copiado no `postinstall` | O empacotador do Next.js não lida bem com o sql.js |
| Uma nota por palavra, com 3 cartões: leitura, audição, produção | A ideia de vários cartões por palavra veio do projeto do Gabriel (que usava 5). Escolhi 3: sem imagem no Karta, e cada tipo a mais multiplica as revisões diárias |
| Cartão de audição só existe se houver áudio | Regra do próprio Anki (`req`): sem o campo exigido, o cartão não é criado |
| IDs estáveis (hash do id do baralho) | Exportar de novo atualiza as cartas no Anki em vez de duplicar |
| [`lib/apkg.js`](../lib/apkg.js) sem dependência do navegador | Permite um teste automático no Node |

**O teste real mudou a ordem do áudio.** Na primeira exportação de verdade, a cota gratuita de voz acabou depois de 5 áudios: 3 palavras e 2 frases, ou seja, só 3 cartões de audição em 10 palavras. Como esse cartão só precisa do áudio da palavra, mudei a geração para fazer primeiro a palavra de todas as cartas e só depois as frases. Com a mesma cota de 5 áudios, a simulação dá 5 cartões de audição. O app continua parando no limite sem perder nada, e a próxima rodada segue de onde parou.

**Verificação em duas camadas.** `npm run testar:apkg` monta um baralho de exemplo (uma carta sem áudio, outra com `<`, `>` e `&`), gera o arquivo, abre de volta e faz 10 verificações. Depois, abri o resultado com outra ferramenta (Python) e comparei com um `.apkg` de referência: mesmas tabelas, mesmos tipos de valor, mesmas chaves no modelo e no baralho, nenhum cartão órfão, todo `[sound:]` presente na mídia.

---

## Preparando para publicar: de quem é a chave?
Num site público, a chave do Gemini no servidor seria usada por qualquer visitante. Com a camada gratuita não há risco de cobrança, mas a cota poderia acabar justamente quando um recrutador abrisse o app. Avaliei três opções: deixar aberto, exigir um código de acesso, ou cada visitante usar a própria chave. Escolhi a terceira, com um baralho de exemplo:

| Peça | Como funciona |
|---|---|
| Baralho de exemplo em `public/demo` | Abre na hora, sem chave e sem cota. Os IDs das cartas ganham o prefixo `demo-` ao importar, para não misturar com baralhos reais |
| Chave do visitante ([`lib/chave.js`](../lib/chave.js)) | Fica só no navegador dele e vai no cabeçalho `x-gemini-key` de cada pedido |
| Escolha da chave no servidor ([`lib/chaveServidor.js`](../lib/chaveServidor.js)) | Usa a do visitante; se não houver, a do `.env.local` (só existe no meu computador). No Vercel nenhuma chave é configurada |
| Tela de Configurações | Explica como criar a chave e como ela é usada; permite remover a qualquer momento |

**Um segundo certificado C2PA.** Ao conferir o `.apkg` do exemplo, encontrei de novo um certificado C2PA nos áudios, agora assinado pela Anthropic ("Anthropic Claude Content Signing"): os arquivos de `public/demo` passaram pelo ambiente do Claude, que assina o que gera. A diferença para o caso do Gemini é que aqui o certificado está num bloco próprio do formato WAV, depois do fim do áudio indicado no cabeçalho. Os tocadores pulam esse bloco, então não há chiado. É o jeito padrão de embutir procedência num WAV, e ele documenta que o arquivo passou por uma IA.

---

## Publicado (14/11) e os primeiros erros de uso real
O Karta foi publicado no Vercel. No primeiro teste com um baralho de japonês, apareceram dois problemas:

**1. "Água" em japonês falada em mandarim.** A primeira suspeita foi reaproveitamento de áudio entre baralhos, por ser o mesmo caractere (水). Conferi o código e descartei: cada áudio é salvo com o ID único da carta. A causa real era a entrada da voz: o app mandava só "水", sem idioma. O kanji é igual em chinês e japonês, e o modelo chutou mandarim. Palavras com hiragana não sofriam com isso, porque hiragana só existe em japonês.

| Correção | Por quê |
|---|---|
| A rota de voz informa o idioma (`languageCode`) e tenta sem ele se o modelo recusar | Diz ao modelo qual língua falar |
| No japonês, palavra sem kana vai para a voz pela leitura em hiragana ([`lib/textoVoz.js`](../lib/textoVoz.js)) | Garante a língua certa mesmo se o campo de idioma for ignorado |
| Cada áudio guarda o texto que o gerou | Só os áudios cujo texto mudou são refeitos: no teste, apenas 水 em japonês. Nada de gastar a cota gerando tudo de novo |

**2. Verso das cartas inconsistente.** O verso mostrava a palavra pequena no canto e a pronúncia grande no centro; no japonês, o kanji ia para o canto e o hiragana para o centro. Agora todos os idiomas seguem o mesmo padrão da frente: a palavra grande no centro, a pronúncia logo abaixo. Em palavras escritas só em kana, a leitura não repete a palavra (mostra só o romaji).

**Ajustes de interface pedidos depois do uso:**
- **Verso por tipo de escrita.** Mandarim e japonês mostram a palavra e a leitura. Inglês, francês e espanhol mostram só o que acrescenta: a palavra já está na frente e o áudio dá a pronúncia. A regra fica em `escritaPropria`, no arquivo de idiomas.
- **Carta que vira nos dois sentidos** (clique ou espaço), com giro 3D. As duas faces ficam sempre montadas, uma de costas para a outra. Três cuidados: a carta seguinte entra já de frente (senão o giro de volta mostraria a resposta dela por um instante); o áudio só toca ao virar para o verso; quem ativa "reduzir movimento" no sistema vê a troca sem animação.
- **Menos "pílulas".** A classe gramatical virou texto pequeno e cinza abaixo da tradução, no app e nos cartões do Anki.

---

## v2 · Protótipo do Módulo 2 (15/11)
A v2 muda o cerne do Karta: a unidade central passa a ser a palavra com suas facetas, e as cartas são derivadas por pontes ([arquitetura](arquitetura/), [modelagem de dados de CauanGS](modelagem/)). Seguindo o próprio documento, o primeiro passo foi prototipar o **Módulo 2** (enriquecimento de facetas) para mandarim e medir qualidade e consumo antes de construir o resto.

**Decisões antes de começar** (a partir da análise do documento):
- Dados no navegador, sem usuários: a modelagem do Cauan não define tabela de usuários nem `user_id`, então serve para uso sem login.
- A lacuna é calculada pelo código: a IA devolve o trecho exato da palavra na frase e o código acha a posição, no formato [início, fim). Funciona com verbo conjugado (japonês 飲みます, francês *mange*), caso que quebraria a regra original de "a palavra aparece na frase".
- A versão lenta do áudio é tocada mais devagar no navegador, sem gerar um segundo arquivo (a cota de voz é curta).
- 10 palavras por chamada, por causa do limite de pedidos por minuto.

Antes de chamar a IA, 24 testes automáticos ([`scripts/testar-v2.mjs`](../scripts/testar-v2.mjs)) cobrem a porta de entrada, a lacuna em três idiomas, a validação do perfil mandarim e o formato das facetas.

**Três rodadas com a mesma lista**, que tem casos difíceis de propósito (palavras ambíguas, verbo genérico, "saudade"). Relatórios em [`prototipos/`](../prototipos/).

| | v1 · lite | v2 · lite | v2 · 3.5-flash |
|---|---|---|---|
| Escrita, pinyin e tons corretos | 10/10 | 10/10 | 10/10 |
| Lacunas válidas | 10/10 | 10/10 | 10/10 |
| Ambiguidades avisadas ("banco", "pegar") | 0 | 2 | 2 (e 1 falsa) |
| "saudade" | 想念 (HSK 4), sem aviso | 想念, sem aviso | 想, como em 我想你了 (nível básico) |
| Tempo | 3 s | 3,4 s | 12,3 s |
| Tokens (saída + raciocínio) | 1.158 | 1.415 | 3.554 |

**O que cada rodada ensinou:**
- **v1 → v2.** O campo de aviso era opcional e o modelo nunca o preenchia. Virou três campos obrigatórios (`ambiguous`, `other_senses`, `level_fit`): com saída estruturada, o modelo é obrigado a decidir. A maiúscula do pinyin da frase passou a ser feita pelo código, porque é regra fixa.
- **Lite × 3.5.** No essencial, os dois acertam tudo. O 3.5 julga melhor (escolhe palavras do nível, frases mais naturais), mas leva 3,6× mais tempo por causa do raciocínio. Decisão: o lite fica como padrão, e a verificação de nível deve vir da lista oficial do HSK, que é um dado, não da opinião do modelo.
- **v2 → v3.** O 3.5 marcou "manga (fruta)" como ambígua mesmo com a dica de sentido. Regra nova no prompt: com dica, a ambiguidade já está resolvida.

---

## Próximas etapas
- [x] Áudio de cada carta (Gemini TTS, com a voz do navegador como plano B)
- [x] Exportação `.apkg` para o Anki
- [x] Deploy no Vercel
