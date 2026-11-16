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

## v2 · Módulo 3 e a regra das cartas irmãs (15/11)
O **Módulo 3** ([`lib/v2/pontes.js`](../lib/v2/pontes.js)) transforma facetas em cartas. O catálogo de 7 pontes da seção 6.1 virou dados: cada ponte guarda os tipos de faceta da frente e do verso (como na modelagem do CauanGS) e um `layout` com o que a carta exibe. Uma ponte só vira carta se as facetas que ela mostra estiverem prontas; o áudio é a exceção, porque, pendente, a carta usa a voz do navegador. Quando uma carta não é criada, o motivo fica registrado (ex.: "frase sem lacuna válida").

**O problema das irmãs.** Sete cartas da mesma palavra no mesmo dia entregam a resposta umas das outras: depois de ver 水 → "água", a carta "áudio → 水" vira trivial. A fila do dia ([`lib/v2/sessao.js`](../lib/v2/sessao.js)) aplica a regra do Anki: **no máximo uma carta por palavra por dia**; as irmãs ficam para os dias seguintes. Isso não contradiz o documento ("todas as pontes valem ao mesmo tempo"): as 7 cartas existem desde o início, só a apresentação é espaçada. Proposta de ordem, da mais fácil para a mais difícil: reconhecer a palavra escrita, depois o áudio, depois a frase e, por último, produzir a frase.

**Com o resultado real do protótipo:** 10 palavras → 70 cartas, nenhuma deixou de ser criada; no primeiro dia, 10 cartas (uma por palavra, começando por Palavra → Significado) e 60 irmãs para os próximos dias.

Testes: 37 no total (`npm run testar:v2`). Um deles falhou na primeira execução, e o erro era do teste: ele esperava 3 pontes de áudio, mas o catálogo tem 4. O teste passou a contar pelo próprio catálogo, em vez de um número escrito à mão.

---

## v2 · Armazenamento (15/11)
As tabelas da modelagem do CauanGS (`concepts`, `facets`, `bridge_templates`, `user_cards`), mais `decks` (documento de arquitetura) e `arquivos` (os áudios), agora ficam no **IndexedDB** do navegador, num banco separado da v1 (`karta-v2`). Não há tabela de usuários: cada navegador é de uma pessoa.

**Repositório separado do armazenamento.** As operações ([`lib/v2/banco.js`](../lib/v2/banco.js)) falam com um adaptador ([`lib/v2/adaptadores.js`](../lib/v2/adaptadores.js)) que oferece sempre as mesmas cinco operações. Há dois: o IndexedDB, para o navegador, e um em memória, para os testes, já que o IndexedDB não existe no Node. Os mesmos testes rodam nos dois; para o do navegador, usa-se um simulador de IndexedDB instalado como dependência de desenvolvimento.

O repositório cobre o que o documento pede para a tela do baralho: adicionar palavras sem reprocessar as antigas, excluir palavra (com facetas, cartas e áudio), suspender carta, áudio sob demanda e editar faceta. A edição segue a seção 6.4 (reinicia as cartas que usam a faceta e deixa o áudio pendente se a escrita ou a frase mudou), com uma proposta nossa: `reiniciar: false` para correções pequenas, como um acento, que não deveriam apagar o histórico de estudo. A função `cartasAfetadas` permite à interface avisar quantas cartas serão reiniciadas antes de confirmar: no teste, editar a escrita afeta 5 das 7 cartas da palavra.

**Correção encontrada no caminho:** o Módulo 2 gerava IDs como `c1` e `f1`, que repetiriam entre baralhos. Com dados guardados, passaram a ser UUIDs.

---

## v2 · Repetição espaçada com FSRS (15/11)
A questão em aberto sobre o algoritmo (seção 10.2 do documento) foi decidida pelo **FSRS**, usando a biblioteca oficial **ts-fsrs**, mantida pelos autores do algoritmo. Implementar as fórmulas à mão seria arriscado; integrar uma biblioteca confiável e adaptá-la ao modelo é o trabalho que importa aqui. A modelagem do CauanGS já usava os nomes do FSRS (`stability`, `difficulty`, `due_at`), o que facilitou.

| FSRS | Modelo (`user_cards`) | Como ficou ([`lib/v2/srs.js`](../lib/v2/srs.js)) |
|---|---|---|
| 4 estados (com Relearning) | NEW, LEARNING, REVIEW | Relearning (errar uma carta que já sabia) vira LEARNING |
| Campos internos (`scheduled_days`, `learning_steps`) | Não existem | Guardados em `srs_extra` (proposta) |
| 4 notas (Again, Hard, Good, Easy) | 3 botões do Karta | Não sei = Again, Acho que sei = Hard, Decorei = Good |

Com o algoritmo de verdade, as respostas "Decorei" seguidas espaçam a carta em **2 → 13 → 48 → 173 → 521 dias**. Os testes ([`scripts/testar-srs.mjs`](../scripts/testar-srs.mjs)) verificam comportamento, não números decorados: quanto melhor a resposta, mais tarde a carta volta; o intervalo cresce a cada acerto; errar uma carta madura a devolve no mesmo dia, conta um lapso e reduz a estabilidade.

Duas coisas apareceram no caminho:
- **A regra das irmãs escondia a própria carta errada.** Com o FSRS, a carta errada volta em minutos, mas a fila do dia a tratava como "palavra já estudada hoje". A regra passou a barrar só as irmãs; um teste novo cobre o caso.
- **A versão instalada era a 6**, mais nova que a esperada, e tinha removido um campo do cartão (`elapsed_days`). Conferir a interface instalada antes de confiar no código evitou guardar um campo vazio.

---

## v2 · Primeiras telas e uma decisão revista (15/11)
As cartas ganharam interface (`/v2`): criação por lista de palavras com prévia em chips antes de gastar IA, tela do baralho com os alertas da IA e uma prévia das cartas de cada palavra, e a sessão de estudo com FSRS. O componente da carta segue o protótipo; o tooltip abre com o mouse no computador, com toque no celular e com o teclado.

**Decisão revista depois de ver as cartas na tela:** a regra das irmãs (uma carta por palavra por dia) e o limite diário saíram. Todas as cartas ficam disponíveis desde a criação do baralho, e a fila de estudo vem **embaralhada**, sem limite. A troca tem um custo conhecido: às vezes duas cartas da mesma palavra caem perto e a segunda fica mais fácil. Se isso pesar no uso, a alternativa leve é impedir só que duas cartas da mesma palavra apareçam em sequência, sem desfazer o embaralhamento.

---

## v2 · Áudio opcional e modo de áudio (15/11)
Duas decisões separadas, porque respondem a perguntas diferentes:

**1. No baralho: "Incluir exercícios de áudio"** (a pessoa quer ou não treinar escuta). Desligado, cada palavra gera 3 cartas em vez de 7. O catálogo de pontes passou a distinguir áudio **essencial** (o áudio é a pergunta ou a resposta) de áudio **auxiliar** (o botão "Ouvir frase" no verso): sem áudio, as cartas com áudio auxiliar continuam existindo, só sem o botão. A opção fica em `decks.facetas_opcionais`, pensada para receber `IMAGE` no futuro.

**2. Em Configurações: de onde vem a voz** (vale para v1 e v2):

| Modo | Gerar gravações | Ao tocar |
|---|---|---|
| Cota e, se esgotar, navegador (padrão) | Sim | Gravação do Gemini; sem ela, voz do navegador |
| Só a cota | Sim | Só gravação; sem ela, a carta avisa que falta gerar |
| Só o navegador | Não (nunca gasta cota) | Sempre a voz do aparelho |

A v2 passou a gerar gravações reaproveitando a rota de voz da v1, já com a ordem aprendida no teste real: primeiro as palavras, depois as frases.

Regras definidas para quando a imagem entrar: a imagem não tem plano B como a voz do navegador (sem imagem, a carta de imagem não é criada); a faceta só é criada se a opção estiver ligada, porque buscar ou gerar imagem custa; palavras abstratas podem não ter carta de imagem.

---

## v2 · Módulo 1: baralho a partir de um tema (15/11)
O modo A do documento de arquitetura (seção 4): a pessoa digita um tema ("frutas", "no restaurante"), escolhe quantidade e nível, e o **Módulo 1** sugere as palavras. Nenhuma carta é criada antes de uma **tela de revisão**, onde dá para editar, remover, acrescentar ou pedir mais palavras à IA. Depois disso, o caminho é o mesmo do modo B (Módulos 2 e 3).

Decisões de encaixe entre os módulos:
- **O Módulo 1 já devolve a palavra em mandarim** (`lemma`) junto com a tradução (`gloss`). O Módulo 2 passou a **respeitar essa palavra** (prompt v4) em vez de traduzir de novo, e a checagem acusa se ele trocar. Sem isso, a palavra revisada poderia mudar no meio do caminho.
- **Editar uma palavra descarta o `lemma`**: o texto mudou, então o Módulo 2 traduz a versão nova. Palavras editadas ou acrescentadas ficam com origem `user`; as sugeridas, `ai`. Um mesmo baralho pode ter as duas.
- **Tema vago:** a resposta da IA tem campos obrigatórios dizendo se o tema serve (`theme_ok`) e, se não servir, uma sugestão (`refinement_hint`). É a mesma técnica de campos obrigatórios que melhorou o prompt v2 do Módulo 2: obrigar a IA a decidir explicitamente, em vez de torcer para ela avisar.
- **"Pedir mais"** manda as palavras que a lista já tem (`existing_words`), para a IA não repetir. O código também remove repetidas, já existentes e inválidas (o que não for caractere chinês), porque não dá para confiar só na instrução.
- **O `lemma` que volta do navegador não é confiável** (qualquer pessoa pode editar a requisição): a rota do Módulo 2 só aceita até 8 caracteres chineses; fora disso, descarta e traduz de novo.

Testes novos cobrem a porta de entrada do tema, a limpeza da lista, o pedido do "gerar mais", o Módulo 2 recebendo a palavra escolhida e a origem mista. Para medir a qualidade das sugestões com a IA de verdade, há o `npm run prototipo:modulo1`, com dois temas bons, um amplo demais ("coisas") e um sem sentido.

**O que o protótipo mostrou (e uma decisão minha que precisou de reforço):**
- **A IA escreveu caracteres errados que parecem certos:** 析璉 no lugar de 西瓜 (melancia), 节林 no lugar de 苹果 (maçã), 栒子 no lugar de 橙子 (laranja). Todos são caracteres chineses válidos, então a checagem de "é caractere chinês?" não pegou. E, como o Módulo 2 passou a respeitar a palavra do Módulo 1, o erro seguiria até a carta. **Correção:** cada palavra é conferida na lista oficial do HSK ([complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary), licença MIT, cerca de 11 mil palavras). Fora da lista, o mandarim é descartado e o Módulo 2 traduz de novo a partir do português. A mesma lista marca palavras acima do nível pedido (aviso na revisão, sem remover). Lição: **validar a IA com uma fonte externa**, não só pelo formato.
- **"Pedir mais" completou com palavras fora do tema** (水 água e 吃 comer em "frutas"), porque no HSK 1 há poucas frutas. **Correção** (prompt v2): se faltarem palavras do tema no nível, devolver menos.
- **Com a lista ligada, apareceu o limite dela:** palavras comuns e corretas como 橙子 (laranja), 草莓 (morango), 点菜 (pedir a comida) e 买单 (pagar a conta) não estão no HSK, que é uma lista de prova, não um dicionário. Por isso a regra é **"fora da lista → traduzir de novo", e não "fora da lista → remover"**: a palavra continua no baralho, e o Módulo 2, que roda de qualquer jeito, confirma o mandarim. A checagem não custa nenhuma chamada extra de IA. Já o nível (HSK 2.0, de 1 a 6) só gera um aviso na revisão.
- Os temas ruins foram recusados com boas sugestões, e "no restaurante" veio certo. Cada chamada levou de 1 a 2,5 segundos.

---

## v2 · Editar o baralho depois de criado e ajustes da interface (15/11)
Até aqui, um baralho criado não mudava mais. Agora o botão **Editar** dá três caminhos:
- **Acrescentar palavras:** digitando ou pedindo à IA sobre um tema (o Módulo 1 recebe as palavras que o baralho já tem, para não repetir), com a mesma revisão da criação antes de gerar as cartas.
- **Corrigir ou excluir em massa:** caixas de seleção à direita das palavras e uma barra com "Corrigir" e "Excluir".
- **Excluir baralho.**

Decisões:
- **Repetição barrada em duas etapas.** Antes da IA, pelo texto em português ("Água" e "água" são a mesma). Depois do Módulo 2, pelo mandarim: "copo" e "xícara" podem virar a mesma palavra, e entrariam cartas duplicadas.
- **Corrigir não apaga o estudo por padrão.** Editar o significado, o pinyin ou a tradução mostra quantas cartas usam aquilo e pergunta se o estudo delas deve recomeçar; a caixa vem desmarcada, porque um erro de digitação ("maã") não muda o que a pessoa aprendeu. É a proposta `reiniciar: false` que já estava no banco, agora com interface.
- **"Gerar de novo"** para erros maiores, com a palavra em português editável e um campo de sentido. A versão nova fica no mesmo lugar da lista. No primeiro teste, o campo de sentido foi lido como "trocar a palavra" (digitei "comidas" ali): a correção foi separar os dois campos, com nomes claros, e o aviso final dizer o que mudou.
- **O tema do "pedir à IA" é editável.** A primeira versão usava o nome do baralho como tema, e "Meu baralho" virou um pedido sem sentido. Agora o campo vem com o tema do baralho, se houver, e o tema que funcionar fica salvo.

**Estudo:**
- **Duas cartas da mesma palavra nunca aparecem em sequência** (a melhoria leve anotada quando o embaralhamento entrou). A primeira versão falhava no fim da fila, quando só sobram cartas de uma palavra; a correção devolve a carta para um ponto anterior. Um teste sorteia 500 filas e confere que nenhuma carta se perde. Um caso de teste que eu tinha escrito não tinha solução possível, e foi o teste que estava errado, não o código.
- **A barra de progresso andava só quando uma carta saía da sessão.** Como uma carta nova volta em 10 minutos (passo de fixação do FSRS), na primeira volta nada saía e a barra ficava parada. Agora ela conta as cartas vistas e mostra quantas faltam rever.

**Interface, a partir do uso:** criar baralho virou uma página própria; ações secundárias viraram links de texto (menos pills); os botões do estudo voltaram ao padrão da v1, sem o tempo de cada resposta e com os atalhos numa linha discreta; avisos de erro só com ⚠, sem a caixa pontilhada; campos menores nos painéis.

---

## v2 · Exportação para o Anki (15/11)
O baralho da v2 agora sai como `.apkg`, com os 7 tipos de carta. Conferido importando no Anki.

- **Uma nota por palavra, um tipo de cartão por ponte.** No Anki, uma nota guarda os dados e gera vários cartões, um por modelo. É o mesmo desenho das facetas e pontes: as facetas viram campos da nota, e cada ponte do catálogo vira um modelo de cartão, na ordem de apresentação (fácil → difícil). Cada carta do Karta vira um cartão; cartas suspensas ficam de fora, e baralho sem áudio sai com 3 cartões por palavra.
- **Reaproveitar sem duplicar.** A v1 já montava o pacote (banco SQLite do Anki, ZIP, mapa de mídia, IDs estáveis). Separei essas partes em funções comuns, e o teste da v1 confirmou que nada quebrou antes de escrever a v2 por cima.
- **O plano B do áudio também existe no Anki.** Gravação pronta vai dentro do pacote; sem gravação, o cartão usa a voz do sistema do próprio Anki (`{{tts zh_CN:...}}`), o equivalente à voz do navegador no Karta.
- **A lacuna e o destaque saem das posições calculadas pelo código**, como no app, e não de um pedido à IA.
- **O histórico de estudo não vai junto:** os cartões chegam novos. O Anki tem o próprio agendador, e converter o estado do FSRS seria outro projeto.

O teste (`npm run testar:apkg`) ganhou 9 verificações da v2 e gera `amostra-v2.apkg` para importar e conferir à mão.

---

## v2 · Módulo 1: um exemplo no prompt que virou regra, e um modelo mais forte (15/11)
Testando a tela nova, o tema "Comida" foi recusado como "amplo demais". **A causa estava no meu prompt:** para explicar o que era um tema amplo, o exemplo que eu tinha escrito era justamente *"comida" é amplo? sugira "frutas"*. O modelo tratou o exemplo como regra. Correção (prompt v3):
- temas amplos do dia a dia (comida, família, casa, viagem) são aceitos explicitamente; recusa só para tema sem sentido, que não é de vocabulário ("coisas") ou impróprio, com "na dúvida, aceite";
- a recusa devolve de 2 a 3 temas sugeridos em lista, e a tela mostra cada um como link que já gera as palavras;
- a primeira rodada trouxe sugestões como "comida: 苹果, 米饭", então o código também garante o formato: corta o que vem depois de ":" e descarta sugestões com caracteres chineses.

**Troca de modelo só no Módulo 1.** O protótipo mostrou que o `flash-lite` errava a escrita (戹果 no lugar de 苹果, 西璜 no lugar de 西瓜, "maã", "pêssago") e fugia do tema no "pedir mais" (água entre as frutas). Como o Módulo 1 pede poucas palavras curtas, passei só ele para o `gemini-3.5-flash`, com o lite de reserva; o Módulo 2, que é a chamada grande, continua no lite. Com a mesma bateria de temas:

| | flash-lite | 3.5-flash |
|---|---|---|
| Caracteres errados (pegos pela lista do HSK) | 4 em 8 palavras de "frutas" | nenhum |
| Erros no português | "maã", "pêssago" | nenhum |
| "Pedir mais" fora do tema | sim (水 água em frutas) | não |
| Tempo por chamada | ~1 s | 2 a 7 s |

Agora, o que aparece como "fora do HSK" são palavras corretas que só não estão na lista da prova (橙子 laranja, 牛肉 carne de boi). A regra de traduzir de novo continua valendo, por segurança. O modelo fica numa variável própria (`GEMINI_THEME_MODEL`).

**Tela de novo baralho:** formulário mais largo no computador; a coluna do mandarim se ajusta à palavra mais longa (电子邮件 não quebra mais); a pill "HSK 6+" virou um ⚠ com tooltip, e palavras fora da lista aparecem normalmente; ✕ no lugar de "remover".

---

## v2 · Ligar e desligar o áudio depois de criar o baralho (15/11)
A opção "Incluir exercícios de áudio" só existia na criação. Agora fica no menu **Editar** do baralho. A decisão foi **suspender, não apagar**:
- **Desligar** suspende as 4 cartas de áudio de cada palavra e guarda as gravações. O botão "Ouvir frase" some das outras cartas, que continuam com o histórico.
- **Ligar de novo** reativa as mesmas cartas, com o histórico de estudo de antes; palavras que entraram com o áudio desligado ganham as cartas de áudio nessa hora.
- As cartas suspensas pelo áudio levam uma marca (`suspensa_por`). Sem ela, religar o áudio reativaria também as cartas que a própria pessoa tinha suspendido de propósito. Um teste cobre esse caso.
- A contagem do baralho passou a mostrar só as cartas ativas, e a exportação para o Anki já deixava as suspensas de fora.

---

## Próximas etapas
- [x] Áudio de cada carta (Gemini TTS, com a voz do navegador como plano B)
- [x] Exportação `.apkg` para o Anki
- [x] Deploy no Vercel
