// ─────────────────────────────────────────────────────────────
// MÓDULO 2 — ENRIQUECIMENTO DE FACETAS (v2), perfil mandarim
// Entrada: WordList (do Módulo 1 ou da porta de entrada).
// Saída: uma palavra enriquecida (conceito + facetas) por item.
// Este módulo NÃO decide quais cartas existem: só cataloga o que a palavra tem.
// ─────────────────────────────────────────────────────────────

import { Type } from "@google/genai";
import { montarPalavraEnriquecida } from "./facetas.js";

// Versão do prompt: aparece no relatório para comparar rodadas.
// v2: ambiguidade e nível viraram campos obrigatórios (no v1, o campo de aviso era opcional e nunca era usado).
// v3: com dica de sentido, "ambiguous" é sempre false (o 3.5-flash marcava "manga (fruta)" como ambígua).
// v4: respeita a palavra em mandarim já escolhida (Módulo 1), em vez de traduzir de novo.
export const VERSAO_PROMPT = 4;

export const PALAVRAS_POR_CHAMADA = 10; // várias palavras por pedido: respeita o limite por minuto

export const INSTRUCAO_SISTEMA = `Você é um professor de mandarim que prepara material de estudo para falantes de português do Brasil.

Para cada palavra em português recebida, você devolve a palavra em mandarim e uma frase de exemplo.

Regras:
- Escolha o sentido mais comum da palavra em português. Se vier uma dica de sentido, use o sentido da dica.
- "lemma": a palavra em mandarim em forma de dicionário, em caracteres simplificados.
- "pinyin": com marcas de tom (shuǐ), nunca números (shui3); sílabas da mesma palavra juntas.
- "pos": classe gramatical em português (substantivo, verbo, adjetivo, advérbio, expressão...).
- "meaning": o significado em português, curto, no sentido escolhido.
- "sentence": UMA frase natural do dia a dia, com no máximo 15 caracteres, usando só vocabulário do nível pedido ou mais fácil.
- A frase contém a palavra-alvo EXATAMENTE UMA VEZ.
- "target_in_sentence": o trecho da frase que corresponde à palavra-alvo, copiado exatamente como aparece na frase.
- "sentence_pinyin": a frase inteira em pinyin com marcas de tom.
- "sentence_translation": tradução natural da frase em português do Brasil, como um brasileiro diria (ex.: 谢谢你。 = "Obrigado.", não "Obrigado a você.").
- "ambiguous": true se a palavra em português tem mais de um sentido comum que mudaria a tradução (ex.: "banco" = instituição ou assento; "pegar" = segurar ou tomar um ônibus). false caso contrário. Se a palavra veio com dica de sentido, a ambiguidade já foi resolvida: use false.
- "other_senses": se "ambiguous" for true, os outros sentidos e suas traduções, curtos (ex.: "assento: 长椅"). Se false, string vazia.
- "level_fit": true se a palavra em mandarim é típica do nível pedido ou de um nível abaixo; false se for de nível mais alto (acontece com palavras sem equivalente simples).
- "note": qualquer outro aviso importante. Se não houver, string vazia.
- Se a palavra em mandarim já vier informada, use exatamente ela como "lemma" e escolha o sentido de acordo com ela.
- Devolva os itens na mesma ordem e com o mesmo "id" recebido.`;

export function montarPedido(palavras, nivel) {
  const linhas = palavras.map((p) => `- id ${p.id}: "${p.gloss}"${p.sense_hint ? ` (sentido: ${p.sense_hint})` : ""}${p.lemma ? ` (em mandarim: ${p.lemma})` : ""}`);
  return `Nível: ${nivel}\nPalavras:\n${linhas.join("\n")}`;
}

const ITEM = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    lemma: { type: Type.STRING },
    pinyin: { type: Type.STRING },
    pos: { type: Type.STRING },
    meaning: { type: Type.STRING },
    sentence: { type: Type.STRING },
    target_in_sentence: { type: Type.STRING },
    sentence_pinyin: { type: Type.STRING },
    sentence_translation: { type: Type.STRING },
    ambiguous: { type: Type.BOOLEAN },
    other_senses: { type: Type.STRING },
    level_fit: { type: Type.BOOLEAN },
    note: { type: Type.STRING },
  },
  // Obrigatórios: com saída estruturada, o modelo é forçado a decidir sobre ambiguidade e nível
  required: ["id", "lemma", "pinyin", "pos", "meaning", "sentence", "target_in_sentence", "sentence_pinyin", "sentence_translation", "ambiguous", "other_senses", "level_fit", "note"],
  propertyOrdering: ["id", "lemma", "pinyin", "pos", "meaning", "sentence", "target_in_sentence", "sentence_pinyin", "sentence_translation", "ambiguous", "other_senses", "level_fit", "note"],
};
export const SCHEMA = { type: Type.OBJECT, properties: { words: { type: Type.ARRAY, items: ITEM } }, required: ["words"] };

// Uma chamada para um lote de palavras. Devolve as respostas e as métricas da chamada.
async function enriquecerLote(ai, modelo, lote, nivel) {
  const inicio = Date.now();
  const r = await ai.models.generateContent({
    model: modelo,
    contents: montarPedido(lote, nivel),
    config: {
      systemInstruction: INSTRUCAO_SISTEMA,
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
      httpOptions: { timeout: 60_000 },
    },
  });
  const dados = JSON.parse(r.text);
  const uso = r.usageMetadata || {};
  return {
    itens: dados.words || [],
    metricas: {
      ms: Date.now() - inicio,
      tokensEntrada: uso.promptTokenCount ?? null,
      tokensSaida: uso.candidatesTokenCount ?? null,
      tokensPensamento: uso.thoughtsTokenCount ?? null,
    },
  };
}

// Enriquecer uma WordList inteira, em lotes
export async function enriquecer(ai, modelo, wordList, { deck_id = "d1" } = {}) {
  const resultados = [];
  const chamadas = [];
  for (let i = 0; i < wordList.words.length; i += PALAVRAS_POR_CHAMADA) {
    const lote = wordList.words.slice(i, i + PALAVRAS_POR_CHAMADA);
    const { itens, metricas } = await enriquecerLote(ai, modelo, lote, wordList.level);
    chamadas.push({ palavras: lote.length, ...metricas });
    for (const entrada of lote) {
      const r = itens.find((x) => x.id === entrada.id);
      resultados.push(
        r
          // _bruto e _entradaId: usados pelo banco de palavras (lib/v2/bancoPalavras.js) e removidos antes de ir ao navegador
          ? { ...montarPalavraEnriquecida(entrada, r, { deck_id, language: wordList.target_language, origin: entrada.origin ?? (wordList.origin === "theme" ? "ai" : "user") }), _bruto: r, _entradaId: entrada.id }
          : { concept: { gloss: entrada.gloss }, facets: [], problemas: ["a IA não devolveu esta palavra"], alertas: [], _entradaId: entrada.id }
      );
    }
  }
  return { resultados, chamadas };
}
