// ─────────────────────────────────────────────────────────────
// MÓDULO 1 — GERAÇÃO DE PALAVRAS (v2) — seção 4 do documento de arquitetura
// Entrada: tema, idioma, nível, quantidade e (opcional) palavras que o baralho já tem.
// Saída: WordList { origin: "theme", theme, target_language, level, words: [{ id, lemma, gloss, origin }] }
// Responsabilidade única: decidir QUAIS palavras entram no baralho.
// ─────────────────────────────────────────────────────────────

import { Type } from "@google/genai";

// v2: se faltarem palavras do tema no nível, devolve menos em vez de completar com palavras fora do tema.
export const VERSAO_PROMPT_M1 = 2;
const HANZI = /^[㐀-鿿]+$/u;

export const INSTRUCAO_SISTEMA = `Você é um professor de mandarim que escolhe vocabulário para falantes de português do Brasil.

Dado um tema, você escolhe palavras para um baralho de estudo.

Regras:
- Cada palavra em forma de dicionário (lema), em caracteres simplificados, sem flexões.
- Só palavras ligadas ao tema; sem repetições e sem variações da mesma palavra.
- Palavras do nível pedido ou mais fáceis, úteis no dia a dia.
- Ordem: da mais básica para a mais específica.
- Nada sensível, ofensivo ou impróprio para estudo.
- "gloss": a tradução em português do Brasil, curta, no sentido do tema.
- Nunca repita palavras da lista "já existentes".
- Se não houver palavras suficientes do tema no nível pedido, devolva MENOS palavras. Nunca complete a quantidade com palavras fora do tema.
- "theme_ok": false se o tema for vago, amplo demais, sem sentido ou impróprio para um baralho; true caso contrário.
- "refinement_hint": se "theme_ok" for false, uma sugestão curta de tema mais específico (ex.: "comida" é amplo? sugira "frutas" ou "pratos do dia a dia"). Se true, string vazia.
- Se "theme_ok" for false, devolva "words" vazio.`;

export function montarPedido({ theme, level, count, existing_words = [] }) {
  return `Tema: ${theme}
Nível: ${level}
Quantidade: ${count} palavras
Já existentes no baralho (não repita): ${existing_words.length ? existing_words.join(", ") : "nenhuma"}`;
}

export const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    theme_ok: { type: Type.BOOLEAN },
    refinement_hint: { type: Type.STRING },
    words: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { lemma: { type: Type.STRING }, gloss: { type: Type.STRING } },
        required: ["lemma", "gloss"],
        propertyOrdering: ["lemma", "gloss"],
      },
    },
  },
  required: ["theme_ok", "refinement_hint", "words"],
  propertyOrdering: ["theme_ok", "refinement_hint", "words"],
};

// Confere a resposta da IA: remove repetidas, já existentes e inválidas; respeita a quantidade
export function limparLista(palavras, { count, existing_words = [] }) {
  const vistos = new Set(existing_words);
  const limpas = [];
  const descartadas = [];
  for (const p of palavras || []) {
    const lemma = (p.lemma || "").trim();
    const gloss = (p.gloss || "").trim();
    if (!HANZI.test(lemma) || !gloss) { descartadas.push({ ...p, motivo: "inválida" }); continue; }
    if (vistos.has(lemma)) { descartadas.push({ ...p, motivo: existing_words.includes(lemma) ? "já existe no baralho" : "repetida" }); continue; }
    vistos.add(lemma);
    limpas.push({ lemma, gloss });
  }
  return { palavras: limpas.slice(0, count), descartadas };
}

// Confere cada palavra na lista oficial do HSK (dicionario: { palavra: nível }).
// Fora da lista → provavelmente a IA errou o caractere (ex.: 析璉 no lugar de 西瓜): o lemma é descartado
// e o Módulo 2 traduz de novo a partir do português. Acima do nível pedido → só um aviso na revisão.
export function nivelNumero(level) { return Number(String(level).match(/\d+/)?.[0]) || null; }
export function conferirNoHSK(palavras, dicionario, level) {
  if (!dicionario) return palavras;
  const pedido = nivelNumero(level);
  return palavras.map((p) => {
    if (!p.lemma) return p;
    const nivel = dicionario[p.lemma];
    if (nivel === undefined) return { ...p, lemma: null, lemma_descartado: p.lemma };
    return { ...p, hsk: nivel, acima_do_nivel: pedido !== null && nivel > pedido };
  });
}

export async function gerarPalavras(ai, modelo, { theme, level, count, existing_words = [], target_language = "zh" }, { dicionario = null } = {}) {
  const r = await ai.models.generateContent({
    model: modelo,
    contents: montarPedido({ theme, level, count, existing_words }),
    config: { systemInstruction: INSTRUCAO_SISTEMA, responseMimeType: "application/json", responseSchema: SCHEMA, httpOptions: { timeout: 45_000 } },
  });
  const dados = JSON.parse(r.text);
  if (!dados.theme_ok) return { refinar: dados.refinement_hint || "Tente um tema mais específico." };

  // Se vierem menos palavras que o pedido, a tela de revisão permite acrescentar
  const { palavras, descartadas } = limparLista(dados.words, { count, existing_words });
  return {
    wordList: {
      origin: "theme", theme, target_language, level,
      words: conferirNoHSK(palavras.map((p, i) => ({ id: `w${i + 1}`, lemma: p.lemma, gloss: p.gloss, origin: "ai", sense_hint: null })), dicionario, level),
    },
    descartadas,
  };
}
