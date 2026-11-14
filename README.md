# Karta

Baralhos de flashcards de idiomas gerados por IA. Você escolhe o idioma, o nível e o tema. O Gemini monta as cartas com pronúncia, tradução e uma frase de exemplo no nível certo, e o app agenda as revisões por repetição espaçada.

> **Status:** em desenvolvimento. A geração com IA, a biblioteca, o baralho, o modo estudo e o áudio estão funcionando. Próxima etapa: exportação para o Anki. Acompanhe pelo [diário de construção](docs/processo.md).

| Baralho gerado pelo Gemini | Modo estudo |
|---|---|
| ![Baralho de mandarim gerado](docs/screenshots/baralho.png) | ![Carta no modo estudo](docs/screenshots/estudo-resposta.png) |

## Origem
O Karta começou como uma nova interface para o [Agente_Flashcards_Mandarim](https://github.com/SanchesPinto/Agente_Flashcards_Mandarim), pipeline em Python de **Gabriel Pinto** (OpenAI, Pexels, edge-tts e genanki). O escopo vem desse projeto: cartas com pinyin e frase de exemplo, áudio separado para palavra e frase e exportação para o Anki.

O código original do Gabriel está preservado em [`v1-python/`](v1-python), com o histórico completo dos commits dele neste repositório. O Karta reescreveu a implementação do zero como app web, sem reaproveitar código: trocou os provedores pelo Gemini e acrescentou vários idiomas, modo estudo com repetição espaçada, modelos reserva e diagnóstico. A comparação completa está no [diário](docs/processo.md#origem-o-projeto-do-gabriel).

## Por que existe
Montar um baralho bom de vocabulário dá trabalho: escolher as palavras do nível, conferir a pronúncia e achar uma frase de exemplo que não use palavras mais difíceis que a própria carta. O Karta faz essa parte em segundos e deixa a pessoa só estudar.

## O que este projeto mostra
| Habilidade | Onde ver |
|---|---|
| Engenharia de prompt | [`lib/prompt.js`](lib/prompt.js): instrução de sistema, regras por idioma e schema de saída |
| Saída estruturada e validação | Schema JSON imposto ao modelo + [`lib/validar.js`](lib/validar.js) |
| Orquestração de modelos com resiliência | [`app/api/gerar/route.js`](app/api/gerar/route.js): novas tentativas, modelos reserva, tempo limite |
| API sem backend próprio | Rota `/api` que vira função serverless e guarda a chave fora do navegador |
| Diagnóstico de problemas reais | [`scripts/diagnostico.mjs`](scripts/diagnostico.mjs), os 6 problemas do [primeiro teste](docs/processo.md#dia-2-1411-as-telas-e-o-primeiro-teste-real) e o [chiado causado por um certificado C2PA](docs/processo.md#dia-2-à-tarde-1411-áudio) |
| Do design ao produto | [Mockups](docs/design) que viraram as telas reais |

## Como funciona

```
Navegador                    Servidor (função serverless)                 Gemini
─────────                    ────────────────────────────                 ──────
Formulário ── POST ──▶  /api/gerar
                        1. valida o pedido
                        2. monta o prompt  ──────────────────────────────▶ modelo principal
                           (se sobrecarregado: espera e tenta de novo;     │ ou reserva
                            depois passa para o modelo reserva)            │
                        3. recebe o JSON   ◀───────────────────────────────┘
                        4. remove cartas repetidas ou incompletas
Salva no   ◀── JSON ──
navegador
    │
    ▼
Estudo: a repetição espaçada decide quando cada carta volta
```

## Decisões principais

| Decisão | Por quê |
|---|---|
| Gemini | Camada gratuita, texto e voz no mesmo provedor |
| Modelos em variáveis de ambiente | Modelos são aposentados e ficam sobrecarregados. Trocar não exige mexer no código |
| Erro 503 e falha de rede: nova tentativa. Erro 401 e 429: para | Só repete o que esperar resolve |
| `localStorage` em vez de banco | MVP sem login. Limite: os dados ficam num navegador só |
| Repetição espaçada própria | Regra simples e explicável: errou, volta na hora; acertou com segurança, o intervalo cresce 2,5× |

## Como rodar

Pré-requisitos: Node.js 20 ou mais novo e uma chave do Gemini ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)).

```bash
npm install
cp .env.example .env.local      # coloque sua chave em GEMINI_API_KEY
npm run diagnostico             # confere a chave e mede quais modelos estão respondendo
npm run dev
```

Abra http://localhost:3000.

## Estrutura

```
app/
  page.jsx                     Biblioteca
  novo/page.jsx                Novo baralho
  baralho/[id]/page.jsx        Lista de cartas
  baralho/[id]/estudar/        Modo estudo
  api/gerar/route.js           Função serverless que chama o Gemini
lib/
  prompt.js                    Prompt e schema
  idiomas.js                   Regras por idioma (usadas pelo prompt e pelas telas)
  validar.js                   Validação do pedido e da resposta
  repeticao.js                 Repetição espaçada
  armazenamento.js             Leitura e escrita no navegador
scripts/diagnostico.mjs        Teste de chave e de modelos
v1-python/                     Projeto original do Gabriel Pinto (Python), preservado
docs/
  processo.md                  Diário de construção
  design/                      Mockups originais
  screenshots/                 Prints do app
```

## Como foi feito
Construído com IA de ponta a ponta, a partir do projeto de Gabriel Pinto (veja [Origem](#origem)): mockups gerados com uma ferramenta de design com IA; código escrito com o Claude como agente, a partir das minhas decisões de produto e dos meus testes; Gemini como motor do produto. Detalhes no [diário](docs/processo.md).
