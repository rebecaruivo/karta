// ─────────────────────────────────────────────────────────────
// MÓDULO 1 — GERAÇÃO DE PALAVRAS (v2) — seção 4 do documento de arquitetura
// Entrada: tema, idioma, nível, quantidade e (opcional) palavras que o baralho já tem.
// Saída: WordList { origin: "theme", theme, target_language, level, words: [{ id, lemma, gloss, origin }] }
// Responsabilidade única: decidir QUAIS palavras entram no baralho.
// ─────────────────────────────────────────────────────────────

import { Type } from "@google/genai";
import { IDIOMAS_V2, idiomaV2, ehMandarim } from "./idiomas.js";

// v2: se faltarem palavras do tema no nível, devolve menos em vez de completar com palavras fora do tema.
// v3: o exemplo da v2 ("comida" é amplo) ensinou a IA a recusar "comida". Agora temas amplos do dia a dia
//     são aceitos, só temas sem sentido ou que não são de vocabulário são recusados, e as sugestões vêm em lista.
// v4: instrução por idioma (5 idiomas), com a escrita do idioma escolhido.
export const VERSAO_PROMPT_M1 = 4;

export function instrucaoDoSistema(cfg) {
  return `Você é um professor de ${cfg.nome.toLowerCase()} que escolhe vocabulário para falantes de português do Brasil.

Dado um tema, você escolhe palavras para um baralho de estudo.

Regras:
- Cada palavra em forma de dicionário (lema), ${cfg.regraPalavra}, sem flexões.
- Só palavras ligadas ao tema; sem repetições e sem variações da mesma palavra.
- Palavras do nível pedido ou mais fáceis, úteis no dia a dia.
- Ordem: da mais básica para a mais específica.
- Nada sensível, ofensivo ou impróprio para estudo.
- "gloss": a tradução em português do Brasil, curta, no sentido do tema.
- Nunca repita palavras da lista "já existentes".
- Se não houver palavras suficientes do tema no nível pedido, devolva MENOS palavras. Nunca complete a quantidade com palavras fora do tema.
- Tema amplo do dia a dia (comida, família, casa, trabalho, viagem) é um bom tema: escolha as palavras mais úteis dele.
- "theme_ok": false SOMENTE se o tema não tiver sentido, não for um assunto de vocabulário (ex.: "coisas", "qualquer", letras soltas) ou for impróprio. Na dúvida, true.
- "suggested_themes": se "theme_ok" for false, de 2 a 3 nomes de temas concretos em português, cada um com 1 a 3 palavras e nada mais (sem exemplos, sem caracteres do idioma-alvo, sem dois-pontos). Se true, lista vazia.
- Se "theme_ok" for false, devolva "words" vazio.`;
}

export const INSTRUCAO_SISTEMA = instrucaoDoSistema(IDIOMAS_V2.zh);

export function montarPedido({ theme, level, count, existing_words = [], target_language = "zh" }) {
  const cfg = idiomaV2(target_language);
  return `Idioma: ${cfg.nome}
Tema: ${theme}
Nível: ${level}
Quantidade: ${count} palavras
Já existentes no baralho (não repita): ${existing_words.length ? existing_words.join(", ") : "nenhuma"}`;
}

export const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    theme_ok: { type: Type.BOOLEAN },
    suggested_themes: { type: Type.ARRAY, items: { type: Type.STRING } },
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
  required: ["theme_ok", "suggested_themes", "words"],
  propertyOrdering: ["theme_ok", "suggested_themes", "words"],
};

// Confere a resposta da IA: remove repetidas, já existentes e inválidas; respeita a quantidade
export function limparLista(palavras, { count, existing_words = [], target_language = "zh" }) {
  const cfg = idiomaV2(target_language);
  const vistos = new Set(existing_words);
  const limpas = [];
  const descartadas = [];
  for (const p of palavras || []) {
    const lemma = (p.lemma || "").trim();
    const gloss = (p.gloss || "").trim();
    if (!cfg.escritaRegex.test(lemma) || !gloss) { descartadas.push({ ...p, motivo: "inválida" }); continue; }
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
export function conferirNoHSK(palavras, dicionario, level, target_language = "zh") {
  if (!dicionario || !ehMandarim(idiomaV2(target_language))) return palavras;
  const pedido = nivelNumero(level);
  return palavras.map((p) => {
    if (!p.lemma) return p;
    const nivel = dicionario[p.lemma];
    if (nivel === undefined) return { ...p, lemma: null, lemma_descartado: p.lemma };
    return { ...p, hsk: nivel, acima_do_nivel: pedido !== null && nivel > pedido };
  });
}

export async function gerarPalavras(ai, modelo, { theme, level, count, existing_words = [], target_language = "zh" }, { dicionario = null } = {}) {
  const cfg = idiomaV2(target_language);
  const r = await ai.models.generateContent({
    model: modelo,
    contents: montarPedido({ theme, level, count, existing_words, target_language }),
    config: { systemInstruction: instrucaoDoSistema(cfg), responseMimeType: "application/json", responseSchema: SCHEMA, httpOptions: { timeout: 45_000 } },
  });
  const dados = JSON.parse(r.text);
  const escritaDoIdioma = cfg.codigo === "zh" ? /[\u3400-\u9fff]/u : cfg.codigo === "ja" ? /[\u3040-\u30ff\u3400-\u9fff]/u : null;
  // refinar = lista de temas sugeridos (limpa e curta), para a tela oferecer como opções clicáveis
  // O código garante o formato mesmo se a IA desobedecer: corta o que vier depois de ":" e descarta a escrita do idioma-alvo
  if (!dados.theme_ok) return { refinar: (dados.suggested_themes || []).map((t) => String(t).split(/[:：]/)[0].trim()).filter((t) => t && t.length <= 40 && !escritaDoIdioma?.test(t)).slice(0, 3) };

  // Se vierem menos palavras que o pedido, a tela de revisão permite acrescentar
  const { palavras, descartadas } = limparLista(dados.words, { count, existing_words, target_language });
  return {
    wordList: {
      origin: "theme", theme, target_language, level,
      words: conferirNoHSK(palavras.map((p, i) => ({ id: `w${i + 1}`, lemma: p.lemma, gloss: p.gloss, origin: "ai", sense_hint: null })), dicionario, level, target_language),
    },
    descartadas,
  };
}
