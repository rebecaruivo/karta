// Consultas do painel de produto. Dados de eventos + retrato do que já existia
// antes dos eventos (decks e user_cards), para a tela não nascer vazia.
import { ESQUEMA_DADOS } from "./dadosServidor.js";
import { garantirEsquemaEventos } from "./eventosServidor.js";

const DIAS_GRAFICO = 14;
const FUSO = "America/Sao_Paulo";

function diaSP(diasAtras = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() - diasAtras * 86400000));
}

async function numero(sql, consulta, valores = []) {
  try {
    const linhas = await sql.query(consulta, valores);
    const n = linhas[0]?.n;
    return Number.isFinite(Number(n)) ? Number(n) : 0;
  } catch {
    return null;
  }
}

async function contarContas(sql) {
  for (const tabela of [`neon_auth."user"`, "neon_auth.users"]) {
    for (const coluna of [`"createdAt"`, "created_at", "criado_em"]) {
      const n = await numero(sql, `SELECT count(*)::int AS n FROM ${tabela} WHERE ${coluna} > now() - interval '7 days'`);
      if (n !== null) return n;
    }
  }
  return null;
}

async function totalContas(sql) {
  for (const tabela of [`neon_auth."user"`, "neon_auth.users"]) {
    const n = await numero(sql, `SELECT count(*)::int AS n FROM ${tabela}`);
    if (n !== null) return n;
  }
  return null;
}

async function criacao(sql, ident) {
  const vazio = { iniciados: 0, concluidos: 0, abandonados: 0, mediana: null, p90: null, media: null };
  try {
    const [duracao] = await sql.query(`WITH inicio AS (
        SELECT deck_id, min(ocorrido_em) AS t FROM eventos
        WHERE tipo = 'baralho_iniciado' AND ${ident} IS NOT NULL AND deck_id IS NOT NULL
        GROUP BY deck_id
      ), fim AS (
        SELECT deck_id, min(ocorrido_em) AS t FROM eventos
        WHERE tipo = 'baralho_criado' AND ${ident} IS NOT NULL AND deck_id IS NOT NULL
        GROUP BY deck_id
      ), pares AS (
        SELECT EXTRACT(EPOCH FROM (fim.t - inicio.t))::double precision AS seg
        FROM inicio JOIN fim USING (deck_id)
        WHERE fim.t - inicio.t BETWEEN interval '0 seconds' AND interval '1 hour'
      )
      SELECT count(*)::int AS concluidos,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY seg)::int AS mediana,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY seg)::int AS p90,
        avg(seg)::int AS media
      FROM pares`);
    const [inicio] = await sql.query(`SELECT count(DISTINCT deck_id)::int AS n FROM eventos
      WHERE tipo = 'baralho_iniciado' AND ${ident} IS NOT NULL AND deck_id IS NOT NULL`);
    const iniciados = inicio?.n ?? 0;
    const concluidos = duracao?.concluidos ?? 0;
    return {
      iniciados,
      concluidos,
      abandonados: Math.max(0, iniciados - concluidos),
      mediana: duracao?.mediana ?? null,
      p90: duracao?.p90 ?? null,
      media: duracao?.media ?? null,
    };
  } catch {
    return vazio;
  }
}

// Custo por transação (últimos 30 dias), a partir do custo que cada evento registra.
// Só entram eventos que trazem custo_usd (o registro de custo começou em 26/11).
const num = (campo) => `(payload->>'${campo}')::double precision`;
export async function coletarCustos(sql) {
  const [b, a, au, an] = await Promise.all([
    sql.query(`SELECT count(*)::int AS n, coalesce(avg(${num("custo_usd")}), 0) AS media, coalesce(sum(${num("custo_usd")}), 0) AS total,
        coalesce(avg(${num("custo_m1_usd")}), 0) AS media_m1,
        coalesce(sum(${num("custo_m2_usd")}), 0) AS total_m2,
        coalesce(sum(${num("n_palavras")}), 0)::int AS palavras, coalesce(sum(${num("n_do_banco")}), 0)::int AS do_banco,
        bool_or((payload->>'custo_estimado')::boolean) AS estimado
      FROM eventos WHERE tipo = 'baralho_criado' AND payload ? 'custo_usd' AND ocorrido_em > now() - interval '30 days'`).catch(() => []),
    sql.query(`SELECT count(*)::int AS n, coalesce(avg(${num("custo_usd")}), 0) AS media, coalesce(sum(${num("custo_usd")}), 0) AS total,
        coalesce(sum(${num("custo_m2_usd")}), 0) AS total_m2,
        coalesce(sum(${num("n_palavras")}), 0)::int AS palavras, coalesce(sum(${num("n_do_banco")}), 0)::int AS do_banco
      FROM eventos WHERE tipo = 'palavras_acrescentadas' AND payload ? 'custo_usd' AND ocorrido_em > now() - interval '30 days'`).catch(() => []),
    sql.query(`SELECT count(*)::int AS n, coalesce(sum(${num("custo_usd")}), 0) AS total, coalesce(sum(${num("n_audios")}), 0)::int AS audios,
        bool_or((payload->>'estimado')::boolean) AS estimado
      FROM eventos WHERE tipo = 'audios_gerados' AND payload ? 'custo_usd' AND ocorrido_em > now() - interval '30 days'`).catch(() => []),
    sql.query(`SELECT count(*)::int AS n, coalesce(avg(${num("custo_usd")}), 0) AS media, coalesce(sum(${num("custo_usd")}), 0) AS total
      FROM eventos WHERE tipo = 'analise_gerada' AND payload ? 'custo_usd' AND ocorrido_em > now() - interval '30 days'`).catch(() => []),
  ]);
  const n = (v) => Number(v) || 0;
  const l = (x) => x?.[0] || {};
  return {
    baralho: { n: n(l(b).n), media: n(l(b).media), total: n(l(b).total), mediaM1: n(l(b).media_m1), totalM2: n(l(b).total_m2), palavras: n(l(b).palavras), doBanco: n(l(b).do_banco), estimado: Boolean(l(b).estimado) },
    acrescentar: { n: n(l(a).n), media: n(l(a).media), total: n(l(a).total), totalM2: n(l(a).total_m2), palavras: n(l(a).palavras), doBanco: n(l(a).do_banco) },
    audio: { n: n(l(au).n), total: n(l(au).total), audios: n(l(au).audios), estimado: Boolean(l(au).estimado) },
    analise: { n: n(l(an).n), media: n(l(an).media), total: n(l(an).total) },
  };
}

export async function coletarMetricas(sql) {
  for (const comando of ESQUEMA_DADOS) await sql.query(comando);
  await garantirEsquemaEventos(sql);

  const [
    contas,
    novas,
    ativacaoLogado,
    ativacaoAnonimo,
    wauLogado,
    wauAnonimo,
    funilLogado,
    funilAnonimo,
    grafico,
    taxas,
  ] = await Promise.all([
    totalContas(sql),
    contarContas(sql),
    numero(sql, `SELECT count(DISTINCT u)::int AS n FROM (
        SELECT user_id AS u FROM decks WHERE user_id IS NOT NULL
        UNION
        SELECT user_id AS u FROM eventos WHERE tipo = 'baralho_criado' AND user_id IS NOT NULL
      ) x`),
    numero(sql, `SELECT count(DISTINCT device_id)::int AS n FROM eventos
      WHERE tipo = 'baralho_criado' AND device_id IS NOT NULL`),
    numero(sql, `SELECT count(DISTINCT u)::int AS n FROM (
        SELECT user_id AS u FROM eventos
          WHERE tipo = 'carta_respondida' AND user_id IS NOT NULL AND ocorrido_em > now() - interval '7 days'
        UNION
        SELECT user_id AS u FROM user_cards WHERE last_review_at > now() - interval '7 days'
      ) x`),
    numero(sql, `SELECT count(DISTINCT device_id)::int AS n FROM eventos
      WHERE tipo = 'carta_respondida' AND device_id IS NOT NULL AND ocorrido_em > now() - interval '7 days'`),
    numero(sql, `SELECT count(DISTINCT user_id)::int AS n FROM (
        SELECT user_id FROM eventos WHERE tipo = 'sessao_iniciada' AND user_id IS NOT NULL
        UNION
        SELECT user_id FROM eventos WHERE tipo = 'carta_respondida' AND user_id IS NOT NULL
      ) y`),
    numero(sql, `SELECT count(DISTINCT device_id)::int AS n FROM eventos
      WHERE tipo = 'sessao_iniciada' AND device_id IS NOT NULL`),
    sql.query(`SELECT to_char((ocorrido_em AT TIME ZONE '${FUSO}')::date, 'YYYY-MM-DD') AS dia,
        (count(*) FILTER (WHERE user_id IS NOT NULL))::int AS logado,
        (count(*) FILTER (WHERE device_id IS NOT NULL))::int AS anonimo
      FROM eventos
      WHERE tipo = 'carta_respondida' AND ocorrido_em > now() - interval '${DIAS_GRAFICO} days'
      GROUP BY 1`).catch(() => []),
    sql.query(`SELECT
        (count(*) FILTER (WHERE user_id IS NOT NULL))::int AS total_logado,
        (count(*) FILTER (WHERE user_id IS NOT NULL AND rating = 'decorei'))::int AS decorei_logado,
        (count(*) FILTER (WHERE user_id IS NOT NULL AND rating = 'nao'))::int AS nao_logado,
        (count(*) FILTER (WHERE device_id IS NOT NULL))::int AS total_anonimo,
        (count(*) FILTER (WHERE device_id IS NOT NULL AND rating = 'decorei'))::int AS decorei_anonimo,
        (count(*) FILTER (WHERE device_id IS NOT NULL AND rating = 'nao'))::int AS nao_anonimo
      FROM eventos
      WHERE tipo = 'carta_respondida' AND ocorrido_em > now() - interval '30 days'`).catch(() => []),
  ]);

  const [criacaoLogado, criacaoAnonimo, baralhos7d, porIdioma, banco, bancoPorIdioma, reaproveitamento, custos] = await Promise.all([
    criacao(sql, "user_id"),
    criacao(sql, "device_id"),
    numero(sql, `SELECT count(*)::int AS n FROM eventos WHERE tipo = 'baralho_criado' AND ocorrido_em > now() - interval '7 days'`),
    sql.query(`SELECT idioma, count(*)::int AS n FROM eventos
      WHERE tipo = 'baralho_criado' AND ocorrido_em > now() - interval '30 days' GROUP BY idioma ORDER BY n DESC`).catch(() => []),
    // Banco de palavras compartilhado: quantas palavras guardadas e quantas vezes foram reaproveitadas
    sql.query(`SELECT count(*)::int AS palavras, coalesce(sum(usos), 0)::int AS usos FROM palavras_geradas`).catch(() => null),
    sql.query(`SELECT idioma, count(*)::int AS palavras, coalesce(sum(usos), 0)::int AS usos
      FROM palavras_geradas GROUP BY idioma ORDER BY palavras DESC`).catch(() => []),
    // Taxa de acerto do banco nos baralhos criados (o evento só passou a trazer n_do_banco em 18/11)
    sql.query(`SELECT coalesce(sum((payload->>'n_do_banco')::int), 0)::int AS do_banco,
        coalesce(sum((payload->>'n_palavras')::int), 0)::int AS palavras
      FROM eventos WHERE tipo = 'baralho_criado' AND payload ? 'n_do_banco'
        AND ocorrido_em > now() - interval '30 days'`).catch(() => []),
    coletarCustos(sql),
  ]);

  const porDia = new Map(grafico.map((l) => [l.dia, l]));
  const serie = [];
  for (let i = DIAS_GRAFICO - 1; i >= 0; i--) {
    const dia = diaSP(i);
    const l = porDia.get(dia);
    serie.push({ dia, logado: l?.logado ?? 0, anonimo: l?.anonimo ?? 0 });
  }

  const t = taxas[0] || {};
  const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : null);

  return {
    contas,
    novas,
    ativacao: { logado: ativacaoLogado ?? 0, anonimo: ativacaoAnonimo ?? 0 },
    wau: { logado: wauLogado ?? 0, anonimo: wauAnonimo ?? 0 },
    serie,
    taxas: {
      logado: { total: t.total_logado ?? 0, decorei: t.decorei_logado ?? 0, nao: t.nao_logado ?? 0 },
      anonimo: { total: t.total_anonimo ?? 0, decorei: t.decorei_anonimo ?? 0, nao: t.nao_anonimo ?? 0 },
      pctDecoreiLogado: pct(t.decorei_logado ?? 0, t.total_logado ?? 0),
      pctNaoLogado: pct(t.nao_logado ?? 0, t.total_logado ?? 0),
      pctDecoreiAnonimo: pct(t.decorei_anonimo ?? 0, t.total_anonimo ?? 0),
      pctNaoAnonimo: pct(t.nao_anonimo ?? 0, t.total_anonimo ?? 0),
    },
    funil: {
      logado: { contas, baralho: ativacaoLogado ?? 0, estudo: funilLogado ?? 0 },
      anonimo: { baralho: ativacaoAnonimo ?? 0, estudo: funilAnonimo ?? 0 },
    },
    criacao: { logado: criacaoLogado, anonimo: criacaoAnonimo },
    baralhos7d: baralhos7d ?? 0,
    porIdioma: porIdioma.map((l) => ({ idioma: l.idioma, n: l.n })),
    banco: banco?.[0] ? {
      palavras: banco[0].palavras, usos: banco[0].usos,
      porIdioma: bancoPorIdioma.map((l) => ({ idioma: l.idioma, palavras: l.palavras, usos: l.usos })),
      doBanco30d: reaproveitamento[0]?.do_banco ?? 0, palavras30d: reaproveitamento[0]?.palavras ?? 0,
    } : null,
    custos,
    geradoEm: new Date().toISOString(),
  };
}
