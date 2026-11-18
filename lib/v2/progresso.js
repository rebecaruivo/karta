// ─────────────────────────────────────────────────────────────
// MEU PROGRESSO (v2): métricas pessoais de estudo, calculadas no navegador.
// Funções puras (sem banco, sem tela), para a aba "Progresso" e os testes usarem as mesmas.
// Entram: baralhos, palavras (conceito + facetas), cartas (estado do FSRS) e revisões
// (o registro de cada resposta). Funciona igual com ou sem conta.
// ─────────────────────────────────────────────────────────────

export const FUSO = "America/Sao_Paulo";
const DIA_MS = 86400000;
export const FIRME_DIAS = 21; // estabilidade de 21+ dias = palavra firme (a convenção "madura" do Anki)

// "2026-11-18" no fuso da pessoa
export function diaLocal(data, fuso = FUSO) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(data));
}
function diasAtras(agora, n, fuso) { return diaLocal(new Date(agora.getTime() - n * DIA_MS), fuso); }

// Cartas respondidas por dia (últimos N dias), com a divisão por resposta
export function porDia(revisoes, { agora = new Date(), dias = 14, fuso = FUSO } = {}) {
  const serie = [];
  const indice = new Map();
  for (let i = dias - 1; i >= 0; i--) {
    const d = { dia: diasAtras(agora, i, fuso), total: 0, nao: 0, acho: 0, decorei: 0 };
    indice.set(d.dia, d); serie.push(d);
  }
  for (const r of revisoes) {
    const d = indice.get(diaLocal(r.respondido_em, fuso));
    if (!d) continue;
    d.total++;
    if (d[r.rating] !== undefined) d[r.rating]++;
  }
  return serie;
}

// Dias seguidos com pelo menos uma resposta. Hoje sem estudo ainda não quebra a sequência.
export function sequencia(revisoes, { agora = new Date(), fuso = FUSO } = {}) {
  const dias = new Set(revisoes.map((r) => diaLocal(r.respondido_em, fuso)));
  const estudouHoje = dias.has(diaLocal(agora, fuso));
  let atual = 0;
  for (let i = estudouHoje ? 0 : 1; dias.has(diasAtras(agora, i, fuso)); i++) atual++;
  return { atual, estudouHoje };
}

// Revisões previstas para os próximos N dias (as atrasadas contam em "hoje")
export function previsao(cartas, { agora = new Date(), dias = 7, fuso = FUSO } = {}) {
  const serie = Array.from({ length: dias }, (_, i) => ({ dia: diaLocal(new Date(agora.getTime() + i * DIA_MS), fuso), total: 0 }));
  const indice = new Map(serie.map((d, i) => [d.dia, i]));
  for (const c of cartas) {
    if (c.suspended || !c.due_at) continue;
    const dia = diaLocal(c.due_at, fuso);
    const i = new Date(c.due_at) <= agora ? 0 : indice.get(dia);
    if (i !== undefined) serie[i].total++;
  }
  return serie;
}

// Etapa de cada carta: nova, aprendendo ou firme
export function etapa(c) {
  if (c.state === "NEW") return "novas";
  if (c.state === "REVIEW" && (c.stability ?? 0) >= FIRME_DIAS) return "firmes";
  return "aprendendo";
}

// Domínio por baralho, contando cartas ativas (não suspensas)
export function dominio(decks, cartas) {
  return decks.map((d) => {
    const conta = { novas: 0, aprendendo: 0, firmes: 0 };
    for (const c of cartas) if (c.deck_id === d.id && !c.suspended) conta[etapa(c)]++;
    return { deck_id: d.id, nome: d.name, idioma: d.target_language, ...conta, total: conta.novas + conta.aprendendo + conta.firmes };
  }).filter((d) => d.total > 0);
}

// Proporção de cada resposta nos últimos N dias
export function respostas(revisoes, { agora = new Date(), dias = 30 } = {}) {
  const desde = agora.getTime() - dias * DIA_MS;
  const conta = { nao: 0, acho: 0, decorei: 0 };
  for (const r of revisoes) if (new Date(r.respondido_em).getTime() >= desde && conta[r.rating] !== undefined) conta[r.rating]++;
  const total = conta.nao + conta.acho + conta.decorei;
  const pct = (n) => (total ? Math.round((n / total) * 100) : null);
  return { total, ...conta, pctNao: pct(conta.nao), pctAcho: pct(conta.acho), pctDecorei: pct(conta.decorei) };
}

// Palavras que mais recebem "Difícil" nos últimos N dias (só palavras que ainda existem)
export function pontosFracos(palavras, revisoes, { agora = new Date(), dias = 30, limite = 10 } = {}) {
  const desde = agora.getTime() - dias * DIA_MS;
  const porConceito = new Map(palavras.map((p) => [p.concept.id, p]));
  const conta = new Map();
  for (const r of revisoes) {
    if (new Date(r.respondido_em).getTime() < desde || !porConceito.has(r.concept_id)) continue;
    const c = conta.get(r.concept_id) ?? { total: 0, dificeis: 0, pontes: {} };
    c.total++;
    if (r.rating === "nao") { c.dificeis++; c.pontes[r.bridge_template_id] = (c.pontes[r.bridge_template_id] ?? 0) + 1; }
    conta.set(r.concept_id, c);
  }
  return [...conta.entries()]
    .filter(([, c]) => c.dificeis >= 2 || (c.total >= 2 && c.dificeis / c.total >= 0.5))
    .map(([id, c]) => {
      const p = porConceito.get(id);
      const f = (tipo) => p.facets.find((x) => x.facet_type === tipo);
      const ponte = Object.entries(c.pontes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return {
        concept_id: id, deck_id: p.concept.deck_id, palavra: f("WORD")?.value ?? p.concept.gloss,
        significado: f("MEANING")?.value ?? p.concept.gloss, classe: f("WORD")?.metadata?.pos ?? null,
        dificeis: c.dificeis, total: c.total, taxa: Math.round((c.dificeis / c.total) * 100), ponteMaisDificil: ponte,
      };
    })
    .sort((a, b) => b.dificeis - a.dificeis || b.taxa - a.taxa)
    .slice(0, limite);
}

// Taxa de "Difícil" agrupada por um campo (tipo de carta ou classe gramatical)
export function dificilPor(revisoes, chave, { agora = new Date(), dias = 30, minimo = 3 } = {}) {
  const desde = agora.getTime() - dias * DIA_MS;
  const grupos = new Map();
  for (const r of revisoes) {
    if (new Date(r.respondido_em).getTime() < desde) continue;
    const k = chave(r);
    if (!k) continue;
    const g = grupos.get(k) ?? { grupo: k, total: 0, dificeis: 0 };
    g.total++; if (r.rating === "nao") g.dificeis++;
    grupos.set(k, g);
  }
  return [...grupos.values()].filter((g) => g.total >= minimo)
    .map((g) => ({ ...g, taxa: Math.round((g.dificeis / g.total) * 100) }))
    .sort((a, b) => b.taxa - a.taxa);
}

// Tudo de uma vez, para a aba
export function calcularProgresso({ decks = [], palavras = [], cartas = [], revisoes = [], agora = new Date(), fuso = FUSO }) {
  const classeDe = new Map(palavras.map((p) => [p.concept.id, p.facets.find((f) => f.facet_type === "WORD")?.metadata?.pos ?? null]));
  return {
    temDados: revisoes.length > 0 || cartas.length > 0,
    sequencia: sequencia(revisoes, { agora, fuso }),
    porDia: porDia(revisoes, { agora, fuso }),
    previsao: previsao(cartas, { agora, fuso }),
    dominio: dominio(decks, cartas),
    respostas: respostas(revisoes, { agora }),
    pontosFracos: pontosFracos(palavras, revisoes, { agora }),
    porPonte: dificilPor(revisoes, (r) => r.bridge_template_id, { agora }),
    porClasse: dificilPor(revisoes, (r) => classeDe.get(r.concept_id), { agora }),
  };
}

// O que vai para a IA: só números e palavras agregados, sem IDs nem nada que identifique a pessoa
export function resumoParaIA(progresso, { idiomas = [] } = {}) {
  return {
    idiomas,
    respostas_30_dias: { total: progresso.respostas.total, dificil_pct: progresso.respostas.pctNao, medio_pct: progresso.respostas.pctAcho, facil_pct: progresso.respostas.pctDecorei },
    dias_seguidos: progresso.sequencia.atual,
    palavras_dificeis: progresso.pontosFracos.map((p) => ({ palavra: p.palavra, significado: p.significado, classe: p.classe, vezes_dificil: p.dificeis, de: p.total, tipo_de_carta_mais_dificil: p.ponteMaisDificil })),
    dificil_por_tipo_de_carta: progresso.porPonte.map(({ grupo, taxa, total }) => ({ tipo: grupo, dificil_pct: taxa, respostas: total })),
    dificil_por_classe: progresso.porClasse.map(({ grupo, taxa, total }) => ({ classe: grupo, dificil_pct: taxa, respostas: total })),
  };
}
