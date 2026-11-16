// ─────────────────────────────────────────────────────────────
// BANCO DE PALAVRAS (v2): palavras já geradas, compartilhadas entre todas as pessoas.
// Quem gera "água" no HSK 1 primeiro paga a chamada ao Gemini; as próximas recebem
// pronto do banco e economizam a cota da própria chave.
//
// Regras (testadas em scripts/testar-v2.mjs):
// - a chave inclui a versão do prompt: prompt novo = palavras novas, sem apagar as antigas;
// - guarda a resposta da IA campo a campo (os IDs das facetas são criados de novo a cada uso);
// - só guarda resposta sem problemas e com o mandarim na lista oficial do HSK;
// - a primeira versão guardada vale; "Gerar de novo" ignora o banco e substitui a versão.
// O armazenamento é um adaptador ({ buscar, guardar }): Postgres em produção
// (bancoPalavrasPostgres.js), memória nos testes.
// ─────────────────────────────────────────────────────────────

import { montarPalavraEnriquecida } from "./facetas.js";

const normalizar = (t) => String(t ?? "").trim().toLowerCase().normalize("NFC").replace(/\s+/g, " ");

export function chavePalavra({ versao, language, level, gloss, sense_hint }) {
  // Ex.: m2:v4:zh:hsk 1:água|  → a mesma palavra, no mesmo nível e com o mesmo prompt, é a mesma linha do banco
  return `m2:v${versao}:${language}:${normalizar(level)}:${normalizar(gloss)}|${normalizar(sense_hint)}`;
}

export function podeGuardar(resultado, dicionario) {
  const r = resultado._bruto;
  if (!r || !resultado.facets?.length || resultado.problemas?.length) return false;
  return dicionario ? dicionario[r.lemma] !== undefined : true;
}

// Separa as palavras: as que o banco já tem (montadas na hora) e as que precisam da IA.
// A palavra escolhida pelo Módulo 1 (lemma) precisa bater com a guardada.
export async function consultarBanco(wordList, { banco, versao, ignorar = false, deck_id = "d1" }) {
  const chaves = new Map(wordList.words.map((w) => [w.id, chavePalavra({ versao, language: wordList.target_language, level: wordList.level, gloss: w.gloss, sense_hint: w.sense_hint })]));
  const guardadas = banco && !ignorar ? await banco.buscar([...new Set(chaves.values())]) : new Map();
  const doBanco = new Map();
  const faltam = [];
  for (const w of wordList.words) {
    const r = guardadas.get(chaves.get(w.id));
    if (r && (!w.lemma || r.lemma === w.lemma)) {
      const origin = w.origin ?? (wordList.origin === "theme" ? "ai" : "user");
      doBanco.set(w.id, { ...montarPalavraEnriquecida(w, r, { deck_id, language: wordList.target_language, origin }), doBanco: true });
    } else faltam.push(w);
  }
  return { doBanco, faltam, chaves };
}

// Junta o que veio do banco com o que veio da IA, na ordem original, e guarda o que for bom.
export async function concluirComBanco(wordList, { doBanco, chaves, resultadosIA, banco, dicionario, versao = null, substituir = false }) {
  const daIA = new Map(resultadosIA.map((r) => [r._entradaId, r]));
  const resultados = wordList.words.map((w) => doBanco.get(w.id) ?? daIA.get(w.id)).filter(Boolean);
  const entradas = new Map(wordList.words.map((w) => [w.id, w]));
  const novos = resultadosIA.filter((r) => podeGuardar(r, dicionario)).map((r) => {
    const { id, ...resposta } = r._bruto;
    const w = entradas.get(r._entradaId);
    return {
      chave: chaves.get(r._entradaId), resposta,
      partes: { versao, idioma: wordList.target_language, nivel: wordList.level, entrada: w.gloss, sentido: w.sense_hint ?? null, hsk: dicionario?.[resposta.lemma] ?? null },
    };
  });
  if (banco && novos.length) {
    try { await banco.guardar(novos, { substituir }); } catch (e) { console.error("[banco de palavras] não consegui guardar:", e?.message); }
  }
  // Campos internos não vão para o navegador
  return resultados.map(({ _bruto, _entradaId, ...r }) => r);
}

// Adaptador em memória (testes)
export function bancoPalavrasMemoria() {
  const dados = new Map();
  return {
    dados,
    async buscar(chaves) { return new Map(chaves.filter((c) => dados.has(c)).map((c) => [c, dados.get(c)])); },
    async guardar(itens, { substituir = false } = {}) { for (const { chave, resposta } of itens) if (substituir || !dados.has(chave)) dados.set(chave, resposta); },
  };
}
