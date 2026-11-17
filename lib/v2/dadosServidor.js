// ─────────────────────────────────────────────────────────────
// BARALHOS NO BANCO (v2, fase 2): os dados de quem está logado, no Postgres.
// Mesmas tabelas da modelagem do CauanGS (concepts, facets, user_cards) + decks,
// agora com user_id: cada linha pertence a uma conta.
//
// Segurança:
// - o user_id vem SEMPRE da sessão (rota /api/v2/dados), nunca do navegador;
// - toda leitura e remoção filtra por user_id;
// - a gravação só atualiza uma linha existente se ela for do mesmo usuário
//   (ninguém sobrescreve dado alheio, mesmo inventando um id);
// - nomes de tabela e coluna vêm só da lista abaixo (sem injeção de SQL).
// Campos que não têm coluna própria vão para "extra" (jsonb), para nada se perder.
// ─────────────────────────────────────────────────────────────

// tipo: "texto" | "inteiro" | "decimal" | "logico" | "data" | "json"
export const TABELAS = {
  decks: {
    indices: [],
    colunas: { name: "texto", creation_mode: "texto", theme: "texto", target_language: "texto", level: "texto",
      facetas_opcionais: "json", pipeline_status: "texto", criado_em: "data", modelo: "texto", versao_prompt: "inteiro" },
  },
  concepts: {
    indices: ["deck_id"],
    colunas: { deck_id: "texto", language: "texto", origin: "texto", sense_hint: "texto", gloss: "texto", position: "inteiro" },
  },
  facets: {
    indices: ["concept_id"],
    colunas: { concept_id: "texto", facet_type: "texto", value: "texto", metadata: "json", status: "texto",
      edited_by_user: "logico", parent_facet_id: "texto" },
  },
  user_cards: {
    indices: ["concept_id", "deck_id"],
    colunas: { deck_id: "texto", concept_id: "texto", bridge_template_id: "texto", state: "texto", stability: "decimal",
      difficulty: "decimal", due_at: "data", last_review_at: "data", reps: "inteiro", lapses: "inteiro",
      suspended: "logico", suspensa_por: "texto", srs_extra: "json" },
  },
};
// Colunas que, vazias, nem aparecem no registro (como no navegador)
const SOME_SE_VAZIO = new Set(["suspensa_por", "srs_extra"]);

const TIPO_SQL = { texto: "text", inteiro: "integer", decimal: "double precision", logico: "boolean", data: "timestamptz", json: "jsonb" };

export const ESQUEMA_DADOS = Object.entries(TABELAS).flatMap(([t, { indices, colunas }]) => [
  `CREATE TABLE IF NOT EXISTS ${t} (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    ${Object.entries(colunas).map(([c, tipo]) => `${c} ${TIPO_SQL[tipo]}`).join(",\n    ")},
    extra jsonb
  )`,
  `CREATE INDEX IF NOT EXISTS ${t}_user ON ${t} (user_id)`,
  ...indices.map((i) => `CREATE INDEX IF NOT EXISTS ${t}_${i} ON ${t} (user_id, ${i})`),
]);

function tabelaValida(t) {
  if (!Object.hasOwn(TABELAS, t)) throw new Error(`Tabela desconhecida: ${t}`);
  return TABELAS[t];
}

// Registro do app → valores das colunas (na ordem de "colunas")
export function paraLinha(t, registro, userId) {
  const { colunas } = tabelaValida(t);
  const nomes = Object.keys(colunas);
  const extra = Object.fromEntries(Object.entries(registro).filter(([k]) => k !== "id" && k !== "user_id" && !nomes.includes(k)));
  const valor = (c) => {
    const v = registro[c];
    if (v === undefined || v === null) return null;
    return colunas[c] === "json" ? JSON.stringify(v) : v;
  };
  return {
    nomes: ["id", "user_id", ...nomes, "extra"],
    valores: [String(registro.id), userId, ...nomes.map(valor), Object.keys(extra).length ? JSON.stringify(extra) : null],
  };
}

// Linha do banco → registro do app (datas em texto ISO, como o app usa)
export function paraRegistro(t, linha) {
  const { colunas } = tabelaValida(t);
  const r = { id: linha.id };
  for (const c of Object.keys(colunas)) {
    let v = linha[c];
    if (v instanceof Date) v = v.toISOString();
    if (typeof v === "string" && colunas[c] === "json") v = JSON.parse(v);
    if (v === null || v === undefined) { if (!SOME_SE_VAZIO.has(c)) r[c] = null; continue; }
    r[c] = v;
  }
  const extra = typeof linha.extra === "string" ? JSON.parse(linha.extra) : linha.extra;
  return extra ? { ...extra, ...r } : r;
}

// Monta o SQL de cada operação (texto + valores), sempre filtrando pelo usuário
export function montarSQL(op, { t, userId, id, indice, valor, registro, ids }) {
  const def = tabelaValida(t);
  switch (op) {
    case "obter": return { texto: `SELECT * FROM ${t} WHERE user_id = $1 AND id = $2`, valores: [userId, String(id)] };
    case "todos": return { texto: `SELECT * FROM ${t} WHERE user_id = $1`, valores: [userId] };
    case "porIndice": {
      if (!def.indices.includes(indice)) throw new Error(`Índice desconhecido: ${t}.${indice}`);
      return { texto: `SELECT * FROM ${t} WHERE user_id = $1 AND ${indice} = $2`, valores: [userId, valor] };
    }
    case "salvar": {
      const { nomes, valores } = paraLinha(t, registro, userId);
      const marcas = nomes.map((n, i) => `$${i + 1}${def.colunas[n] === "json" || n === "extra" ? "::jsonb" : ""}`);
      const atualizar = nomes.filter((n) => n !== "id" && n !== "user_id").map((n) => `${n} = EXCLUDED.${n}`).join(", ");
      return {
        texto: `INSERT INTO ${t} (${nomes.join(", ")}) VALUES (${marcas.join(", ")})
                ON CONFLICT (id) DO UPDATE SET ${atualizar} WHERE ${t}.user_id = EXCLUDED.user_id`,
        valores,
      };
    }
    case "remover": return { texto: `DELETE FROM ${t} WHERE user_id = $1 AND id = ANY($2)`, valores: [userId, ids.map(String)] };
    default: throw new Error(`Operação desconhecida: ${op}`);
  }
}

// Executa uma operação do adaptador para um usuário. sql = cliente do Neon (ou um simulado nos testes).
let pronto = null;
export async function executar(sql, userId, { op, tabela: t, id, indice, valor, registros = [], ids = [] }) {
  if (!userId) throw new Error("Sem usuário.");
  if (!pronto) pronto = (async () => { for (const c of ESQUEMA_DADOS) await sql.query(c); })().catch((e) => { pronto = null; throw e; });
  await pronto;
  if (op === "salvar") {
    for (const registro of registros) { const q = montarSQL("salvar", { t, userId, registro }); await sql.query(q.texto, q.valores); }
    return null;
  }
  if (op === "remover") {
    if (!ids.length) return null;
    const q = montarSQL("remover", { t, userId, ids }); await sql.query(q.texto, q.valores); return null;
  }
  const q = montarSQL(op, { t, userId, id, indice, valor });
  const linhas = await sql.query(q.texto, q.valores);
  if (op === "obter") return linhas[0] ? paraRegistro(t, linhas[0]) : undefined;
  return linhas.map((l) => paraRegistro(t, l));
}
export function reiniciarEsquema() { pronto = null; } // para os testes
