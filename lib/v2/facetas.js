// ─────────────────────────────────────────────────────────────
// FACETAS (v2) — monta o EnrichedWord do documento de arquitetura (seção 5)
// a partir da resposta da IA, calcula as facetas derivadas e valida.
//
// Modelo de dados idealizado por CauanGS (docs/modelagem):
// conceito -> facetas tipadas (WORD, MEANING, SENTENCE, AUDIO, IMAGE),
// com atributos específicos de cada tipo em `metadata`.
// ─────────────────────────────────────────────────────────────

const HANZI = /^[㐀-鿿]+$/u;
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

// Regras de qualidade do perfil "mandarim" (seção 5.1). Devolve a lista de problemas.
export function validarMandarim(r) {
  const p = [];
  if (!HANZI.test(r.lemma || "")) p.push("escrita com caracteres que não são hanzi");
  if (NUMERO_DE_TOM.test(r.pinyin || "") || NUMERO_DE_TOM.test(r.sentence_pinyin || "")) p.push("pinyin com número de tom em vez de marca");
  if (!r.sentence) p.push("sem frase de exemplo");
  else if (Array.from(r.sentence).length > 25) p.push("frase longa demais (mais de 25 caracteres)");
  if (!r.meaning) p.push("sem significado");
  return p;
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

let contador = 0;
const novoId = (prefixo) => `${prefixo}${++contador}`;

// Monta o EnrichedWord no formato do documento
export function montarPalavraEnriquecida(entrada, r, { deck_id, language, origin }) {
  const conceito = { id: novoId("c"), deck_id, language, origin, sense_hint: entrada.sense_hint ?? null, gloss: entrada.gloss };
  const problemas = validarMandarim(r);
  const lacuna = r.sentence ? calcularLacuna(r.sentence, r.target_in_sentence) : { erro: "sem frase" };
  if (lacuna.erro) problemas.push(`lacuna: ${lacuna.erro}`);

  // level_fit e ambiguous/other_senses são propostas acrescentadas ao metadata (não estão na modelagem original)
  const word = { id: novoId("f"), facet_type: "WORD", value: r.lemma, metadata: { pinyin: r.pinyin, pos: r.pos, level_fit: r.level_fit ?? null }, status: r.lemma ? "ready" : "failed", edited_by_user: false };
  const meaning = { id: novoId("f"), facet_type: "MEANING", value: r.meaning, metadata: { ambiguous: r.ambiguous ?? null, other_senses: r.other_senses || null }, status: r.meaning ? "ready" : "failed", edited_by_user: false };
  const sentence = {
    id: novoId("f"), facet_type: "SENTENCE", value: r.sentence,
    metadata: { pinyin: capitalizarPinyin(r.sentence_pinyin), translation: r.sentence_translation, ...(lacuna.indices ? { cloze_indices: lacuna.indices } : {}) },
    // Sem lacuna válida a frase ainda serve para outras pontes, mas não para a de lacuna
    status: r.sentence ? "ready" : "failed", edited_by_user: false,
  };
  // Áudio nasce pendente e não bloqueia nada (seção 5.2); velocidade lenta é tocada no navegador
  const audioPalavra = { id: novoId("f"), facet_type: "AUDIO", parent_facet_id: word.id, value: null, metadata: {}, status: "pending", edited_by_user: false };
  const audioFrase = { id: novoId("f"), facet_type: "AUDIO", parent_facet_id: sentence.id, value: null, metadata: {}, status: "pending", edited_by_user: false };

  return { concept: conceito, facets: [word, meaning, sentence, audioPalavra, audioFrase], problemas, alertas: alertas(r) };
}
