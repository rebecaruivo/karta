// Eventos de produto no Postgres: tabela própria, idempotente pelo event_id.
// Identidade: quem está logado grava com user_id; quem não está, com device_id.
const TIPOS = new Set(["sessao_iniciada", "carta_respondida", "baralho_iniciado", "baralho_criado"]);
const NOTAS = new Set(["nao", "acho", "decorei"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ESQUEMA_EVENTOS = [
  `CREATE TABLE IF NOT EXISTS eventos (
    event_id uuid PRIMARY KEY,
    user_id text,
    device_id text,
    tipo text NOT NULL,
    deck_id text,
    card_id text,
    concept_id text,
    rating text,
    duracao_ms integer,
    idioma text,
    ocorrido_em timestamptz NOT NULL,
    recebido_em timestamptz NOT NULL DEFAULT now(),
    app_versao text,
    payload jsonb,
    CONSTRAINT eventos_identidade CHECK ((user_id IS NOT NULL) <> (device_id IS NOT NULL))
  )`,
  `CREATE INDEX IF NOT EXISTS eventos_user ON eventos (user_id, ocorrido_em)`,
  `CREATE INDEX IF NOT EXISTS eventos_device ON eventos (device_id, ocorrido_em)`,
  `CREATE INDEX IF NOT EXISTS eventos_tipo ON eventos (tipo, ocorrido_em)`,
];

let pronto = null;
export async function garantirEsquemaEventos(sql) {
  pronto ??= (async () => {
    for (const comando of ESQUEMA_EVENTOS) await sql.query(comando);
  })().catch((e) => {
    pronto = null;
    throw e;
  });
  return pronto;
}

function texto(v, max = 200) {
  return typeof v === "string" && v.trim() ? v.slice(0, max) : null;
}

function nota(v) {
  return typeof v === "string" && NOTAS.has(v) ? v : null;
}

function duracao(v) {
  if (!Number.isFinite(v)) return null;
  return Math.min(Math.max(Math.round(v), 0), 86400000);
}

function quando(v) {
  const agora = Date.now();
  const t = Date.parse(v);
  const base = Number.isFinite(t) ? t : agora;
  const minimo = agora - 7 * 24 * 60 * 60 * 1000;
  const maximo = agora + 5 * 60 * 1000;
  return new Date(Math.min(Math.max(base, minimo), maximo)).toISOString();
}

function extrair(evento, { userId, deviceId }) {
  if (!evento || typeof evento !== "object") return null;
  if (!UUID.test(evento.event_id ?? "")) return null;
  if (!TIPOS.has(evento.tipo)) return null;
  return {
    event_id: evento.event_id,
    user_id: userId ? String(userId) : null,
    device_id: userId ? null : deviceId,
    tipo: evento.tipo,
    deck_id: texto(evento.deck_id),
    card_id: texto(evento.card_id),
    concept_id: texto(evento.concept_id),
    rating: nota(evento.rating),
    duracao_ms: duracao(evento.duracao_ms),
    idioma: texto(evento.idioma, 10),
    ocorrido_em: quando(evento.ocorrido_em),
    app_versao: texto(evento.app_versao, 40),
    payload: evento.payload && typeof evento.payload === "object" ? JSON.stringify(evento.payload) : null,
  };
}

const INSERIR = `INSERT INTO eventos
  (event_id, user_id, device_id, tipo, deck_id, card_id, concept_id, rating, duracao_ms, idioma, ocorrido_em, app_versao, payload)
  VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12, $13::jsonb)
  ON CONFLICT (event_id) DO NOTHING`;

function erroStatus(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

export async function registrarEventos(sql, { userId = null, deviceId = null, eventos = [] } = {}) {
  const identificacao = userId ? null : deviceId;
  if (!userId && !(typeof identificacao === "string" && UUID.test(identificacao))) {
    throw erroStatus(400, "Payload sem identidade.");
  }
  await garantirEsquemaEventos(sql);

  const vistos = new Set();
  const validos = [];
  for (const bruto of eventos) {
    const e = extrair(bruto, { userId, deviceId: identificacao });
    if (!e || vistos.has(e.event_id)) continue;
    vistos.add(e.event_id);
    validos.push(e);
  }
  if (!validos.length) return { ok: true, processados: 0 };

  const ident = userId ? String(userId) : identificacao;
  const [{ n }] = await sql.query(
    `SELECT count(*)::int AS n FROM eventos
     WHERE coalesce(user_id, device_id) = $1 AND recebido_em > now() - interval '1 minute'`,
    [ident]
  );
  if ((n ?? 0) + validos.length > 600) throw erroStatus(429, "Muitos eventos em pouco tempo.");

  for (const e of validos) {
    await sql.query(INSERIR, [
      e.event_id, e.user_id, e.device_id, e.tipo, e.deck_id, e.card_id, e.concept_id,
      e.rating, e.duracao_ms, e.idioma, e.ocorrido_em, e.app_versao, e.payload,
    ]);
  }
  return { ok: true, processados: validos.length };
}
