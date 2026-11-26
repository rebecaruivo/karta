// Transforma as métricas brutas (metricas.js) no que o painel mostra: números de cabeçalho,
// comparação com conta × sem conta, funis com conversão e o banco de palavras.
// Funções puras, sem banco de dados, para dar para testar (scripts/testar-painel.mjs).
import { IDIOMAS_V2 } from "./idiomas.js";
import { formatarUsd, formatarBrl, COTACAO_USD_BRL, PRECOS_CONSULTADOS_EM } from "./custos.js";

export const taxa = (parte, total) => (total > 0 && parte !== null && parte !== undefined ? Math.round((parte / total) * 100) : null);

export const fmt = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("pt-BR"));
export const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);
export const dur = (s) => (s === null || s === undefined ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, "0")}s`);
export const nomeIdioma = (codigo) => IDIOMAS_V2[codigo]?.nome ?? codigo ?? "—";

// Cada etapa mostra quanto passou da anterior. A primeira é a base (100%).
export function funilComConversao(etapas) {
  return etapas.map((e, i) => ({
    ...e,
    conversao: i === 0 ? null : taxa(e.valor ?? 0, etapas[i - 1].valor ?? 0),
    largura: taxa(e.valor ?? 0, etapas[0].valor ?? 0) ?? 0,
  }));
}

export function montarPainel(m) {
  const cartas7d = m.serie.slice(-7).reduce((s, d) => s + d.logado + d.anonimo, 0);
  const cartas7dAntes = m.serie.slice(-14, -7).reduce((s, d) => s + d.logado + d.anonimo, 0);
  const t = m.taxas;

  const destaques = [
    { titulo: "Estudaram nos últimos 7 dias", valor: fmt(m.wau.logado + m.wau.anonimo), nota: `${fmt(m.wau.logado)} com conta · ${fmt(m.wau.anonimo)} sem conta` },
    { titulo: "Cartas respondidas (7 dias)", valor: fmt(cartas7d), nota: variacao(cartas7d, cartas7dAntes) },
    { titulo: "Baralhos criados (7 dias)", valor: fmt(m.baralhos7d) },
    { titulo: "Contas", valor: fmt(m.contas), nota: m.novas === null ? null : `${fmt(m.novas)} novas em 7 dias` },
  ];

  // Linhas da tabela comparativa: [rótulo, com conta, sem conta, nota]
  const comparacao = [
    ["Criaram ao menos um baralho", fmt(m.ativacao.logado), fmt(m.ativacao.anonimo)],
    ["Estudaram nos últimos 7 dias", fmt(m.wau.logado), fmt(m.wau.anonimo)],
    ["Respostas “Fácil” (30 dias)", pct(t.pctDecoreiLogado), pct(t.pctDecoreiAnonimo), "de todas as respostas"],
    ["Respostas “Difícil” (30 dias)", pct(t.pctNaoLogado), pct(t.pctNaoAnonimo)],
    ["Tempo para criar um baralho", tempo(m.criacao.logado), tempo(m.criacao.anonimo), "mediana · p90"],
    ["Baralhos concluídos", concluidos(m.criacao.logado), concluidos(m.criacao.anonimo), "dos iniciados"],
  ];

  const funis = {
    logado: funilComConversao([
      { rotulo: "Criou a conta", valor: m.funil.logado.contas ?? 0 },
      { rotulo: "Criou o 1º baralho", valor: m.funil.logado.baralho },
      { rotulo: "Estudou", valor: m.funil.logado.estudo },
    ]),
    anonimo: funilComConversao([
      { rotulo: "Criou o 1º baralho", valor: m.funil.anonimo.baralho },
      { rotulo: "Estudou", valor: m.funil.anonimo.estudo },
    ]),
  };

  const maxIdioma = Math.max(1, ...m.porIdioma.map((l) => l.n));
  const idiomas = m.porIdioma.map((l) => ({ nome: nomeIdioma(l.idioma), n: l.n, largura: Math.round((l.n / maxIdioma) * 100) }));

  const banco = m.banco && {
    palavras: fmt(m.banco.palavras),
    usos: fmt(m.banco.usos),
    acerto: taxa(m.banco.doBanco30d, m.banco.palavras30d),
    palavras30d: m.banco.palavras30d,
    porIdioma: m.banco.porIdioma.map((l) => ({ nome: nomeIdioma(l.idioma), palavras: fmt(l.palavras), usos: fmt(l.usos) })),
  };

  const custos = m.custos ? montarCustos(m.custos) : null;
  const vazio = !m.serie.some((d) => d.logado + d.anonimo) && !m.baralhos7d && !(m.ativacao.logado + m.ativacao.anonimo);
  return { destaques, comparacao, funis, idiomas, banco, custos, vazio, serie: m.serie };
}

function variacao(agora, antes) {
  if (!antes) return agora ? "sem base na semana anterior" : null;
  const v = Math.round(((agora - antes) / antes) * 100);
  return `${v > 0 ? "+" : ""}${v}% sobre os 7 dias anteriores`;
}
const tempo = (c) => (c.mediana === null ? "—" : `${dur(c.mediana)} · ${dur(c.p90)}`);
const concluidos = (c) => (c.iniciados ? `${fmt(c.concluidos)} de ${fmt(c.iniciados)}` : "—");

// ── Custo por transação ─────────────────────────────────────
// Divide o que cada transação custou pelo que ela entregou. Sem medição, a linha mostra "—".
const dividir = (a, b) => (b > 0 ? a / b : null);
export const GRAVACOES_POR_PALAVRA = 2; // áudio da palavra e da frase

export function montarCustos(c) {
  const palavrasIA = (c.baralho.palavras - c.baralho.doBanco) + (c.acrescentar.palavras - c.acrescentar.doBanco);
  const porPalavraIA = dividir(c.baralho.totalM2 + c.acrescentar.totalM2, palavrasIA);
  const porAudio = dividir(c.audio.total, c.audio.audios);
  const palavrasPorBaralho = dividir(c.baralho.palavras, c.baralho.n);
  const porBaralho = c.baralho.n ? c.baralho.media : null;
  // Um baralho "completo": criar (Módulos 1 e 2) + gravar palavra e frase de cada palavra
  const baralhoCompleto = porBaralho !== null && porAudio !== null && palavrasPorBaralho !== null
    ? porBaralho + palavrasPorBaralho * GRAVACOES_POR_PALAVRA * porAudio : null;
  const palavrasDoBanco = c.baralho.doBanco + c.acrescentar.doBanco;
  const economia = porPalavraIA === null ? null : palavrasDoBanco * porPalavraIA;
  const total = c.baralho.total + c.acrescentar.total + c.audio.total + c.analise.total;

  const linha = (rotulo, usd, amostra, nota) => ({ rotulo, usd: formatarUsd(usd), brl: formatarBrl(usd), amostra, nota, vazio: usd === null });
  const medidos = (n, palavra) => (n ? `${n} ${palavra}` : "sem medição ainda");
  const linhas = [
    linha("Criar um baralho", porBaralho, medidos(c.baralho.n, "baralho(s)"),
      palavrasPorBaralho ? `média de ${Math.round(palavrasPorBaralho)} palavras; inclui sugerir (Módulo 1) e gerar as facetas (Módulo 2)` : null),
    linha("Uma palavra gerada pela IA", porPalavraIA, medidos(palavrasIA, "palavra(s)"), "Módulo 2: tradução, frase, leitura e classe"),
    linha("Uma palavra que veio do banco", palavrasDoBanco || porPalavraIA !== null ? 0 : null, medidos(palavrasDoBanco, "palavra(s)"), "reaproveitada, sem chamar a IA"),
    linha("Uma gravação de áudio", porAudio, medidos(c.audio.audios, "gravação(ões)"), `${GRAVACOES_POR_PALAVRA} por palavra: a palavra e a frase`),
    linha("Acrescentar palavras a um baralho", c.acrescentar.n ? c.acrescentar.media : null, medidos(c.acrescentar.n, "vez(es)")),
    linha("Uma análise do progresso", c.analise.n ? c.analise.media : null, medidos(c.analise.n, "análise(s)")),
  ];
  const destaques = [
    { titulo: "Baralho completo, com áudio", valor: formatarBrl(baralhoCompleto), nota: baralhoCompleto === null ? "precisa de baralhos e áudios medidos" : `${formatarUsd(baralhoCompleto)} · criar + ${GRAVACOES_POR_PALAVRA} gravações por palavra` },
    { titulo: "1.000 baralhos por mês custariam", valor: formatarBrl(baralhoCompleto === null ? null : baralhoCompleto * 1000), nota: "projeção com o custo médio medido" },
    { titulo: "Economia do banco (30 dias)", valor: formatarBrl(economia), nota: economia === null ? null : `${palavrasDoBanco} palavras sem chamar a IA` },
    { titulo: "Gasto medido (30 dias)", valor: formatarBrl(total), nota: formatarUsd(total) },
  ];
  return {
    linhas, destaques,
    estimado: c.baralho.estimado || c.audio.estimado,
    nota: `Preços do plano pago do Gemini consultados em ${PRECOS_CONSULTADOS_EM.split("-").reverse().join("/")}; dólar a R$ ${COTACAO_USD_BRL.toLocaleString("pt-BR")}.`,
    porPalavraIA, porAudio, porBaralho, baralhoCompleto, economia, total,
  };
}
