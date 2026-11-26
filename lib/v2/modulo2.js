// ─────────────────────────────────────────────────────────────
// MÓDULO 2 — ENRIQUECIMENTO DE FACETAS (v2), um perfil por idioma
// Entrada: WordList (do Módulo 1 ou da porta de entrada).
// Saída: uma palavra enriquecida (conceito + facetas) por item.
// Este módulo NÃO decide quais cartas existem: só cataloga o que a palavra tem.
// ─────────────────────────────────────────────────────────────

import { Type } from "@google/genai";
import { montarPalavraEnriquecida } from "./facetas.js";
import { IDIOMAS_V2, idiomaV2, descricaoLimiteFrase } from "./idiomas.js";
import { usoDaResposta, custoDaChamada } from "./custos.js";

// Versão do prompt: aparece no relatório para comparar rodadas.
// v2: ambiguidade e nível viraram campos obrigatórios (no v1, o campo de aviso era opcional e nunca era usado).
// v3: com dica de sentido, "ambiguous" é sempre false (o 3.5-flash marcava "manga (fruta)" como ambígua).
// v4: respeita a palavra em mandarim já escolhida (Módulo 1), em vez de traduzir de novo.
// v5 (18/11): inglês, francês e espanhol passaram a ter leitura (IPA), francês e espanhol perderam o artigo
//     e ganharam o campo "genero". Como a versão faz parte da chave do banco de palavras, subir a versão faz
//     as palavras serem geradas de novo no formato novo, em vez de o banco servir o formato antigo.
// 18/11: inglês, francês e espanhol deixaram de pedir IPA. A versão não subiu de propósito: o resultado só perdeu
// um campo que o app agora ignora nesses idiomas, então o que já está no banco continua válido (e subir a versão
// obrigaria a gerar de novo também as palavras de mandarim e japonês, que não mudaram).
export const VERSAO_PROMPT = 5;

export const PALAVRAS_POR_CHAMADA = 10; // várias palavras por pedido: respeita o limite por minuto

export function instrucaoDoSistema(cfg) {
  const leitura = cfg.temLeitura
    ? `- "leitura": ${cfg.regraLeitura}.
- "frase_leitura": a frase inteira no mesmo formato de "leitura".
`
    : "";
  return `Você é um professor de ${cfg.nome.toLowerCase()} que prepara material de estudo para falantes de português do Brasil.

Para cada palavra em português recebida, você devolve a palavra no idioma-alvo e uma frase de exemplo.

Regras:
- Escolha o sentido mais comum da palavra em português. Se vier uma dica de sentido, use o sentido da dica.
- "lemma": a palavra no idioma-alvo, ${cfg.regraPalavra}.
${leitura}- "pos": classe gramatical em português (substantivo, verbo, adjetivo, advérbio, expressão...).
${cfg.temGenero ? `- "genero": se a palavra for um substantivo, "m" (masculino) ou "f" (feminino) em ${cfg.nome.toLowerCase()}; para as outras classes, string vazia.` : ""}
- "meaning": o significado em português, curto, no sentido escolhido.
- "sentence": UMA frase natural do dia a dia, com no máximo ${descricaoLimiteFrase(cfg)}, usando só vocabulário do nível pedido ou mais fácil.
- A frase contém a palavra-alvo EXATAMENTE UMA VEZ.
- "target_in_sentence": o trecho da frase que corresponde à palavra-alvo, copiado exatamente como aparece na frase.
- "sentence_translation": tradução natural da frase em português do Brasil, como um brasileiro diria (ex.: 谢谢你。 = "Obrigado.", não "Obrigado a você.").
- "ambiguous": true se a palavra em português tem mais de um sentido comum que mudaria a tradução (ex.: "banco" = instituição ou assento; "pegar" = segurar ou tomar um ônibus). false caso contrário. Se a palavra veio com dica de sentido, a ambiguidade já foi resolvida: use false.
- "other_senses": se "ambiguous" for true, os outros sentidos e suas traduções, curtos (ex.: "assento: 长椅"). Se false, string vazia.
- "level_fit": true se a palavra no idioma-alvo é típica do nível pedido ou de um nível abaixo; false se for de nível mais alto (acontece com palavras sem equivalente simples).
- "note": qualquer outro aviso importante. Se não houver, string vazia.
- Se a palavra no idioma-alvo já vier informada, use exatamente ela como "lemma" e escolha o sentido de acordo com ela.
- Devolva os itens na mesma ordem e com o mesmo "id" recebido.`;
}

export const INSTRUCAO_SISTEMA = instrucaoDoSistema(IDIOMAS_V2.zh);

export function montarPedido(palavras, nivel, target_language = "zh") {
  const cfg = idiomaV2(target_language);
  const linhas = palavras.map((p) => `- id ${p.id}: "${p.gloss}"${p.sense_hint ? ` (sentido: ${p.sense_hint})` : ""}${p.lemma ? ` (em ${cfg.nome.toLowerCase()}: ${p.lemma})` : ""}`);
  return `Nível: ${nivel}\nPalavras:\n${linhas.join("\n")}`;
}

function itemSchema(cfg) {
  const properties = {
    id: { type: Type.STRING },
    lemma: { type: Type.STRING },
    ...(cfg.temLeitura ? { leitura: { type: Type.STRING } } : {}),
    pos: { type: Type.STRING },
    ...(cfg.temGenero ? { genero: { type: Type.STRING } } : {}),
    meaning: { type: Type.STRING },
    sentence: { type: Type.STRING },
    target_in_sentence: { type: Type.STRING },
    ...(cfg.temLeitura ? { frase_leitura: { type: Type.STRING } } : {}),
    sentence_translation: { type: Type.STRING },
    ambiguous: { type: Type.BOOLEAN },
    other_senses: { type: Type.STRING },
    level_fit: { type: Type.BOOLEAN },
    note: { type: Type.STRING },
  };
  // Obrigatórios: com saída estruturada, o modelo é forçado a decidir sobre ambiguidade e nível
  const ordering = Object.keys(properties);
  return { type: Type.OBJECT, properties, required: ordering, propertyOrdering: ordering };
}

function schemaDe(cfg) {
  return { type: Type.OBJECT, properties: { words: { type: Type.ARRAY, items: itemSchema(cfg) } }, required: ["words"] };
}

export const SCHEMA = schemaDe(IDIOMAS_V2.zh);

// Uma chamada para um lote de palavras. Devolve as respostas e as métricas da chamada.
async function enriquecerLote(ai, modelo, lote, nivel, target_language) {
  const cfg = idiomaV2(target_language);
  const inicio = Date.now();
  const r = await ai.models.generateContent({
    model: modelo,
    contents: montarPedido(lote, nivel, target_language),
    config: {
      systemInstruction: instrucaoDoSistema(cfg),
      responseMimeType: "application/json",
      responseSchema: schemaDe(cfg),
      httpOptions: { timeout: 60_000 },
    },
  });
  const dados = JSON.parse(r.text);
  const uso = usoDaResposta(r, modelo);
  return {
    itens: dados.words || [],
    metricas: {
      ms: Date.now() - inicio,
      tokensEntrada: uso.entrada,
      tokensSaida: uso.saida,
      tokensPensamento: uso.pensamento,
      ...custoDaChamada(uso), // modelo que respondeu, tokens e US$
    },
  };
}

// Enriquecer uma WordList inteira, em lotes
export async function enriquecer(ai, modelo, wordList, { deck_id = "d1" } = {}) {
  const cfg = idiomaV2(wordList.target_language);
  const resultados = [];
  const chamadas = [];
  for (let i = 0; i < wordList.words.length; i += PALAVRAS_POR_CHAMADA) {
    const lote = wordList.words.slice(i, i + PALAVRAS_POR_CHAMADA);
    const { itens, metricas } = await enriquecerLote(ai, modelo, lote, wordList.level, cfg.codigo);
    chamadas.push({ palavras: lote.length, ...metricas });
    for (const entrada of lote) {
      const r = itens.find((x) => x.id === entrada.id);
      resultados.push(
        r
          ? { ...montarPalavraEnriquecida(entrada, r, { deck_id, language: cfg.codigo, origin: entrada.origin ?? (wordList.origin === "theme" ? "ai" : "user") }), _bruto: r, _entradaId: entrada.id }
          : { concept: { gloss: entrada.gloss }, facets: [], problemas: ["a IA não devolveu esta palavra"], alertas: [], _entradaId: entrada.id }
      );
    }
  }
  return { resultados, chamadas };
}
