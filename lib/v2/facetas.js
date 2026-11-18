// ─────────────────────────────────────────────────────────────
// FACETAS (v2) — monta o EnrichedWord do documento de arquitetura (seção 5)
// a partir da resposta da IA, calcula as facetas derivadas e valida.
//
// Modelo de dados idealizado por CauanGS (docs/modelagem):
// conceito -> facetas tipadas (WORD, MEANING, SENTENCE, AUDIO, IMAGE),
// com atributos específicos de cada tipo em `metadata`.
// ─────────────────────────────────────────────────────────────

import { idiomaV2, ehMandarim, tamanhoDaFrase } from "./idiomas.js";

const NUMERO_DE_TOM = /[a-zü][1-5]\b/i;

// Lacuna: posição do alvo na frase, como intervalo [início, fim) em caracteres
// (contando por caractere de verdade, não por unidade interna do JavaScript).
// A IA devolve o trecho exato como aparece na frase; o código acha a posição.
// Assim funciona também quando a frase traz a palavra flexionada.
export function calcularLacuna(frase, trecho) {
  const chars = Array.from(frase);
  const alvo = Array.from(trecho || "");
  if (!alvo.length) return { erro: "a IA não informou o trecho da palavra na frase" };
  const posicoes = [];
  for (let i = 0; i + alvo.length <= chars.length; i++) {
    if (alvo.every((c, j) => chars[i + j] === c)) posicoes.push(i);
  }
  if (posicoes.length === 0) return { erro: `o trecho "${trecho}" não aparece na frase` };
  if (posicoes.length > 1) return { erro: `o trecho "${trecho}" aparece ${posicoes.length} vezes na frase` };
  return { indices: [posicoes[0], posicoes[0] + alvo.length] };
}

// Mostra a frase com a lacuna (a lacuna não é guardada: é calculada na hora de exibir)
export function fraseComLacuna(frase, [ini, fim], marca = "＿＿") {
  const chars = Array.from(frase);
  return chars.slice(0, ini).join("") + marca + chars.slice(fim).join("");
}

// Regras de qualidade do perfil do idioma. Devolve a lista de problemas.
export function validarIdioma(r, cfg) {
  const p = [];
  const leitura = r.leitura ?? r.pinyin;
  const leituraFrase = r.frase_leitura ?? r.sentence_pinyin;
  if (!cfg.escritaRegex.test(r.lemma || "")) {
    p.push(ehMandarim(cfg) ? "escrita com caracteres que não são hanzi" : `escrita inválida para ${cfg.nome}`);
  }
  if (cfg.temLeitura) {
    if (!leitura) p.push("sem leitura");
    if (ehMandarim(cfg) && (NUMERO_DE_TOM.test(leitura || "") || NUMERO_DE_TOM.test(leituraFrase || ""))) {
      p.push("pinyin com número de tom em vez de marca");
    }
  }
  if (!r.sentence) p.push("sem frase de exemplo");
  else if (tamanhoDaFrase(cfg, r.sentence) > cfg.limiteFrase.max) {
    p.push(cfg.limiteFrase.tipo === "palavras"
      ? `frase longa demais (mais de ${cfg.limiteFrase.max} palavras)`
      : `frase longa demais (mais de ${cfg.limiteFrase.max} caracteres)`);
  }
  if (!r.meaning) p.push("sem significado");
  return p;
}

export function validarMandarim(r) {
  return validarIdioma(r, idiomaV2("zh"));
}

// Faceta derivada por regra: primeira letra do pinyin da frase em maiúscula (wǒ -> Wǒ)
export function capitalizarPinyin(texto = "") {
  const chars = Array.from(texto);
  const i = chars.findIndex((c) => /\p{L}/u.test(c));
  if (i < 0) return texto;
  chars[i] = chars[i].toLocaleUpperCase();
  return chars.join("");
}

// Alertas não são erros: a palavra serve, mas o usuário deve saber (e pode corrigir com a dica de sentido)
export function alertas(r) {
  const a = [];
  if (r.ambiguous) a.push(`ambígua${r.other_senses ? `: também pode ser ${r.other_senses}` : ""}`);
  if (r.level_fit === false) a.push("acima do nível pedido");
  if (r.note) a.push(r.note);
  return a;
}

// IDs únicos (UUID): os dados são guardados, então "c1", "f1" repetiriam entre baralhos
const novoId = () => crypto.randomUUID();

// Monta o EnrichedWord no formato do documento
export function montarPalavraEnriquecida(entrada, r, { deck_id, language, origin }) {
  const cfg = idiomaV2(language);
  const leitura = r.leitura ?? r.pinyin ?? null;
  const leituraFrase = r.frase_leitura ?? r.sentence_pinyin ?? null;
  const conceito = { id: novoId(), deck_id, language: cfg.codigo, origin, sense_hint: entrada.sense_hint ?? null, gloss: entrada.gloss };
  const problemas = validarIdioma(r, cfg);
  if (entrada.lemma && r.lemma !== entrada.lemma) problemas.push(`trocou a palavra escolhida (${entrada.lemma} → ${r.lemma})`);
  const lacuna = r.sentence ? calcularLacuna(r.sentence, r.target_in_sentence) : { erro: "sem frase" };
  if (lacuna.erro) problemas.push(`lacuna: ${lacuna.erro}`);

  // level_fit e ambiguous/other_senses são propostas acrescentadas ao metadata (não estão na modelagem original)
  const word = {
    id: novoId(), facet_type: "WORD", value: r.lemma,
    metadata: {
      ...(cfg.temLeitura && leitura ? { leitura } : {}), pos: r.pos,
      // Gênero só em idiomas que têm (francês, espanhol) e só "m"/"f"; qualquer outra coisa é descartada
      ...(cfg.temGenero && ["m", "f"].includes(String(r.genero ?? "").trim().toLowerCase()) ? { genero: String(r.genero).trim().toLowerCase() } : {}),
      level_fit: r.level_fit ?? null,
    },
    status: r.lemma ? "ready" : "failed", edited_by_user: false,
  };
  const meaning = { id: novoId(), facet_type: "MEANING", value: r.meaning, metadata: { ambiguous: r.ambiguous ?? null, other_senses: r.other_senses || null }, status: r.meaning ? "ready" : "failed", edited_by_user: false };
  const sentence = {
    id: novoId(), facet_type: "SENTENCE", value: r.sentence,
    metadata: {
      // Só o pinyin começa com maiúscula; IPA e kana ficam exatamente como vieram.
      ...(cfg.temLeitura && leituraFrase ? { leitura: ehMandarim(cfg) ? capitalizarPinyin(leituraFrase) : leituraFrase } : {}),
      translation: r.sentence_translation,
      ...(lacuna.indices ? { cloze_indices: lacuna.indices } : {}),
    },
    // Sem lacuna válida a frase ainda serve para outras pontes, mas não para a de lacuna
    status: r.sentence ? "ready" : "failed", edited_by_user: false,
  };
  // Áudio nasce pendente e não bloqueia nada (seção 5.2); velocidade lenta é tocada no navegador
  const audioPalavra = { id: novoId(), facet_type: "AUDIO", parent_facet_id: word.id, value: null, metadata: {}, status: "pending", edited_by_user: false };
  const audioFrase = { id: novoId(), facet_type: "AUDIO", parent_facet_id: sentence.id, value: null, metadata: {}, status: "pending", edited_by_user: false };

  return { concept: conceito, facets: [word, meaning, sentence, audioPalavra, audioFrase], problemas, alertas: alertas(r) };
}
