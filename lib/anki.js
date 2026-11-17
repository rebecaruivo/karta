// ─────────────────────────────────────────────────────────────
// MONTAGEM DE ARQUIVOS .apkg (formato do Anki)
// Partes compartilhadas pela exportação da v2: SQLite, ZIP, modelo de nota,
// IDs estáveis e o carregamento do sql.js no navegador.
// ─────────────────────────────────────────────────────────────

export const SEPARADOR = "\x1f";

// Mesmas tabelas que o Anki cria (formato de coleção versão 11)
export const ESQUEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);`;

// Hash simples e estável (FNV-1a): o mesmo texto sempre dá o mesmo número.
export function hashNumero(texto) {
  let h = 2166136261;
  for (const ch of texto) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
export const idEstavel = (texto) => 2 ** 30 + (hashNumero(texto) % 2 ** 30);

// O Anki guarda um "checksum" do primeiro campo para achar duplicatas:
// os 8 primeiros dígitos hexadecimais do SHA-1, como número.
export async function checksum(texto) {
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(texto));
  const hex = [...new Uint8Array(hash)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
  return parseInt(hex, 16);
}

export const escaparHtml = (t = "") =>
  String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Modelo de nota do Anki: campos + tipos de cartão ({ nome, exige, frente, verso })
export function montarModelo({ id, nome, idBaralho, css, campos, tipos }) {
  const I = Object.fromEntries(campos.map((c, i) => [c, i]));
  return {
    id: String(id), name: nome, type: 0, mod: Math.floor(Date.now() / 1000), usn: -1, sortf: 0, did: idBaralho, tags: [], vers: [],
    latexsvg: false,
    latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    latexPost: "\\end{document}",
    css,
    flds: campos.map((name, ord) => ({ name, ord, font: "Arial", media: [], rtl: false, size: 20, sticky: false })),
    tmpls: tipos.map((t, ord) => ({ name: t.nome, ord, qfmt: t.frente, afmt: t.verso, bqfmt: "", bafmt: "", bfont: "", bsize: 0, did: null })),
    req: tipos.map((t, ord) => [ord, "all", t.exige.map((c) => I[c])]),
  };
}

// Banco SQLite da coleção, já com o baralho, o modelo e a configuração de estudo
export function criarColecao({ SQL, modelo, idBaralho, nomeBaralho, descricao }) {
  const agoraMs = Date.now();
  const agoraS = Math.floor(agoraMs / 1000);
  const baralhoPadrao = {
    id: 1, name: "Default", conf: 1, desc: "", dyn: 0, collapsed: false, usn: 0, mod: agoraS,
    extendNew: 10, extendRev: 50, newToday: [0, 0], revToday: [0, 0], lrnToday: [0, 0], timeToday: [0, 0],
  };
  const baralhos = {
    1: baralhoPadrao,
    [idBaralho]: { ...baralhoPadrao, id: idBaralho, name: nomeBaralho, desc: descricao, usn: -1 },
  };
  const configuracaoDeEstudo = {
    1: {
      id: 1, name: "Default", autoplay: true, replayq: true, timer: 0, maxTaken: 60, mod: 0, usn: 0,
      new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20, separate: true },
      rev: { bury: true, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 100 },
      lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
    },
  };
  const conf = {
    activeDecks: [1], curDeck: 1, curModel: modelo.id, addToCur: true, collapseTime: 1200,
    dueCounts: true, estTimes: true, newBury: true, newSpread: 0, nextPos: 1, sortBackwards: false,
    sortType: "noteFld", timeLim: 0,
  };
  const db = new SQL.Database();
  db.exec(ESQUEMA);
  db.run("INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '{}')", [
    agoraS, agoraMs, agoraMs,
    JSON.stringify(conf), JSON.stringify({ [modelo.id]: modelo }), JSON.stringify(baralhos), JSON.stringify(configuracaoDeEstudo),
  ]);
  return db;
}

// Fecha o pacote: ZIP com a coleção, o mapa de mídia e os arquivos
export async function empacotar({ JSZip, db, midia, arquivos }) {
  const zip = new JSZip();
  zip.file("collection.anki2", db.export());
  db.close();
  zip.file("media", JSON.stringify(midia));
  for (const { indice, bytes } of arquivos) zip.file(indice, bytes);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// O sql.js é carregado como script de /public/sqljs (copiado do node_modules
// no "postinstall"), fora do empacotador do Next.js, que não lida bem com ele.
let carregando = null;
export function carregarSqlJs() {
  if (!carregando) {
    carregando = new Promise((ok, falha) => {
      if (window.initSqlJs) return ok();
      const script = document.createElement("script");
      script.src = "/sqljs/sql-wasm.js";
      script.onload = ok;
      script.onerror = () => falha(new Error("Não consegui carregar o SQLite. Rode npm install de novo."));
      document.head.appendChild(script);
    }).then(() => window.initSqlJs({ locateFile: (arquivo) => `/sqljs/${arquivo}` }));
    carregando.catch(() => { carregando = null; });
  }
  return carregando;
}
