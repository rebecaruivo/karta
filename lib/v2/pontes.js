// ─────────────────────────────────────────────────────────────
// MÓDULO 3 — MONTAGEM DE PONTES (v2) — seção 6 do documento de arquitetura
// Transforma facetas em cartas. Uma ponte é uma regra declarativa:
// "da faceta X (frente) para a faceta Y (verso)".
//
// Modelo de dados idealizado por CauanGS (docs/modelagem): bridge_templates
// guarda só os TIPOS de faceta; o que cada carta exibe fica em `layout`.
// Cartas (user_cards) apontam para o conceito e para a ponte, sem copiar conteúdo.
// ─────────────────────────────────────────────────────────────

// Facetas opcionais: o baralho escolhe se as quer (hoje AUDIO; no futuro, IMAGE).
// Uma ponte cuja frente ou verso É uma faceta opcional desligada não gera carta.
// Áudio "auxiliar" (o botão "Ouvir frase" no verso) não é o exercício: a carta
// continua existindo sem ele, só sem o botão.
export const FACETAS_OPCIONAIS = ["AUDIO", "SENTENCE", "IMAGE"];
// Padrão de um baralho novo: frase e áudio ligados (7 cartas por palavra). Palavra e significado são obrigatórios.
export const FACETAS_PADRAO = ["AUDIO", "SENTENCE"];

// Facetas ligadas num baralho. Baralhos de antes de 18/11 só registravam o áudio (a frase não era
// opcional); para eles a frase conta como ligada. Os novos levam facetas_versao: 2.
export function facetasDoBaralho(deck) {
  const lista = deck?.facetas_opcionais ?? ["AUDIO"];
  return deck?.facetas_versao >= 2 ? lista : [...new Set([...lista, "SENTENCE"])];
}
// Quantas cartas cada palavra gera com essas facetas (ex.: as duas ligadas = 7)
export const cartasPorPalavra = (facetas, catalogo = CATALOGO_PONTES) => pontesDoBaralho(catalogo, facetas).length;

// Catálogo da seção 6.1. "de" diz de qual faceta é o áudio (palavra ou frase),
// usando o parent_facet_id. "ordem" é a proposta de apresentação (fácil -> difícil).
export const CATALOGO_PONTES = [
  { id: "AUDIO_TO_WORD", front_facet_types: ["AUDIO"], back_facet_types: ["WORD"], instruction: "Compreensão de palavra", ordem: 3,
    layout: { frente: [{ tipo: "AUDIO", de: "WORD" }], verso: [{ tipo: "WORD", mostrar: ["valor", "pronuncia"] }, { tipo: "MEANING", sobDemanda: true }] }, active: true },
  { id: "AUDIO_TO_MEANING", front_facet_types: ["AUDIO"], back_facet_types: ["MEANING"], instruction: "Tradução de palavra", ordem: 2,
    layout: { frente: [{ tipo: "AUDIO", de: "WORD" }], verso: [{ tipo: "MEANING" }, { tipo: "WORD", mostrar: ["valor", "pronuncia"] }] }, active: true },
  { id: "WORD_TO_AUDIO", front_facet_types: ["WORD"], back_facet_types: ["AUDIO"], instruction: "Pronúncia de palavra", ordem: 4,
    layout: { frente: [{ tipo: "WORD", mostrar: ["valor"] }], verso: [{ tipo: "AUDIO", de: "WORD" }, { tipo: "WORD", mostrar: ["pronuncia"] }] }, active: true },
  { id: "MEANING_TO_SENTENCE", front_facet_types: ["SENTENCE"], back_facet_types: ["SENTENCE"], instruction: "Tradução para o idioma-alvo", ordem: 7,
    layout: { frente: [{ tipo: "SENTENCE", mostrar: ["traducao"] }], verso: [{ tipo: "SENTENCE", mostrar: ["valor", "destaque", "pronuncia"] }, { tipo: "AUDIO", de: "SENTENCE", auxiliar: true }] }, active: true },
  { id: "SENTENCE_AUDIO_TO_SENTENCE", front_facet_types: ["AUDIO"], back_facet_types: ["SENTENCE"], instruction: "Compreensão de frase", ordem: 5,
    layout: { frente: [{ tipo: "AUDIO", de: "SENTENCE", velocidades: ["normal", "lenta"] }], verso: [{ tipo: "SENTENCE", mostrar: ["valor", "destaque", "pronuncia"] }, { tipo: "SENTENCE", mostrar: ["traducao"], sobDemanda: true }] }, active: true },
  { id: "CLOZE_SENTENCE_TO_WORD", front_facet_types: ["SENTENCE"], back_facet_types: ["WORD"], instruction: "Complete a lacuna", ordem: 6,
    layout: { frente: [{ tipo: "SENTENCE", mostrar: ["lacuna", "traducao"] }], verso: [{ tipo: "SENTENCE", mostrar: ["valor", "destaque"] }, { tipo: "WORD", mostrar: ["valor", "pronuncia"] }, { tipo: "MEANING" }, { tipo: "AUDIO", de: "SENTENCE", auxiliar: true }] }, active: true },
  { id: "WORD_TO_MEANING", front_facet_types: ["WORD"], back_facet_types: ["MEANING"], instruction: "Tradução de palavra", ordem: 1,
    layout: { frente: [{ tipo: "WORD", mostrar: ["valor"] }], verso: [{ tipo: "MEANING" }, { tipo: "WORD", mostrar: ["classe"] }] }, active: true },
];

// O que uma ponte exige de uma palavra para virar carta (seção 6.3):
// - facetas de texto usadas na frente/verso precisam estar "ready";
// - áudio é exceção: pendente vale, porque a carta usa a voz do navegador;
// - a lacuna exige cloze_indices; a frente "traducao" exige a tradução da frase.
function motivoParaNaoCriar(ponte, facetas) {
  const porTipo = (tipo) => facetas.filter((f) => f.facet_type === tipo);
  const itens = [...ponte.layout.frente, ...ponte.layout.verso.filter((i) => !i.sobDemanda && !i.auxiliar)];
  for (const item of itens) {
    if (item.tipo === "AUDIO") {
      const pai = facetas.find((f) => f.facet_type === item.de);
      const audio = porTipo("AUDIO").find((a) => a.parent_facet_id === pai?.id);
      if (!audio) return `sem faceta de áudio da ${item.de === "WORD" ? "palavra" : "frase"}`;
      continue; // pending ou failed: a carta usa a voz do navegador
    }
    const faceta = porTipo(item.tipo)[0];
    if (!faceta || faceta.status !== "ready" || !faceta.value) return `faceta ${item.tipo} não está pronta`;
    if (item.mostrar?.includes("lacuna") && !faceta.metadata?.cloze_indices) return "frase sem lacuna válida";
    if (item.mostrar?.includes("traducao") && !faceta.metadata?.translation) return "frase sem tradução";
  }
  return null;
}

// Monta as cartas de uma lista de palavras enriquecidas (saída do Módulo 2).
// "existentes": cartas que já existem; a combinação (conceito, ponte) é única,
// então rodar de novo não duplica nada.
// facetasOpcionais: as facetas opcionais ligadas no baralho (padrão: com áudio)
export function pontesDoBaralho(catalogo, facetasOpcionais = FACETAS_PADRAO) {
  const desligadas = FACETAS_OPCIONAIS.filter((t) => !facetasOpcionais.includes(t));
  return catalogo.filter((p) => p.active && ![...p.front_facet_types, ...p.back_facet_types].some((t) => desligadas.includes(t)));
}

export function montarCartas(palavras, { catalogo = CATALOGO_PONTES, existentes = [], agora = new Date(), facetasOpcionais = FACETAS_PADRAO } = {}) {
  const jaExiste = new Set(existentes.map((c) => `${c.concept_id}|${c.bridge_template_id}`));
  const cartas = [];
  const naoCriadas = [];
  for (const { concept, facets } of palavras) {
    for (const ponte of pontesDoBaralho(catalogo, facetasOpcionais)) {
      if (jaExiste.has(`${concept.id}|${ponte.id}`)) continue;
      const motivo = motivoParaNaoCriar(ponte, facets);
      if (motivo) { naoCriadas.push({ concept_id: concept.id, gloss: concept.gloss, ponte: ponte.id, motivo }); continue; }
      cartas.push({
        id: `uc-${concept.id}-${ponte.id}`,
        concept_id: concept.id,
        bridge_template_id: ponte.id,
        state: "NEW",                       // toda carta nasce NEW (modelagem)
        stability: null, difficulty: null,  // campos de SRS (modelagem); algoritmo: FSRS
        due_at: agora.toISOString(),        // já disponível para estudo
        last_review_at: null, reps: 0, lapses: 0,
        suspended: false,
      });
    }
  }
  return { cartas, naoCriadas };
}
