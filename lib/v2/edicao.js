// ─────────────────────────────────────────────────────────────
// EDIÇÃO DE UM BARALHO JÁ CRIADO (v2) — seção 3.3 e 6.4 do documento
// Regras puras (sem banco nem IA), para a tela e os testes usarem as mesmas.
// ─────────────────────────────────────────────────────────────

const normalizar = (t) => String(t || "").trim().toLowerCase();

// Palavras digitadas que o baralho já tem (mesmo texto em português): nem vão para a IA
export function separarPorGloss(novas, palavrasDoBaralho) {
  const ja = new Set(palavrasDoBaralho.map((p) => normalizar(p.concept.gloss)));
  const vistas = new Set();
  const seguir = [], repetidas = [];
  for (const n of novas) {
    const g = normalizar(n.gloss);
    if (ja.has(g) || vistas.has(g)) repetidas.push(n);
    else { vistas.add(g); seguir.push(n); }
  }
  return { seguir, repetidas };
}

// Depois do Módulo 2: palavras cujo mandarim o baralho já tem (ex.: "copo" e "xícara" → 杯子)
// não entram de novo, porque gerariam cartas duplicadas.
export function separarRepetidas(enriquecidas, palavrasDoBaralho) {
  const escrita = (p) => p.facets?.find((f) => f.facet_type === "WORD")?.value;
  const ja = new Set(palavrasDoBaralho.map(escrita).filter(Boolean));
  const novas = [], repetidas = [];
  for (const p of enriquecidas) {
    const w = escrita(p);
    if (w && ja.has(w)) repetidas.push(p);
    else { if (w) ja.add(w); novas.push(p); }
  }
  return { novas, repetidas };
}

// Escritas em mandarim do baralho, para o "pedir mais à IA" não repetir
export const escritasDoBaralho = (palavras) => palavras.map((p) => p.facets.find((f) => f.facet_type === "WORD")?.value).filter(Boolean);
