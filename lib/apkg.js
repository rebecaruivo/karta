// ─────────────────────────────────────────────────────────────
// MONTAGEM DO ARQUIVO .apkg (formato de pacote do Anki)
// Escrito do zero para o Karta a partir do formato público do Anki.
//
// Um .apkg é um ZIP com:
//   collection.anki2  -> banco SQLite com o baralho, o modelo e as cartas
//   media             -> JSON que liga "0", "1"... aos nomes dos arquivos
//   0, 1, 2...        -> os arquivos de mídia (aqui, os áudios WAV)
//
// No Anki, uma NOTA guarda os dados da palavra e gera vários CARTÕES,
// um para cada modelo de cartão. A ideia de vários tipos de cartão por
// palavra veio do projeto de Gabriel Pinto (veja docs/processo.md).
//
// Este arquivo não depende do navegador: recebe o SQLite (sql.js) e o
// JSZip prontos. Assim ele pode ser testado no Node (scripts/testar-apkg.mjs).
// ─────────────────────────────────────────────────────────────

const SEPARADOR = "\x1f"; // o Anki separa os campos da nota com este caractere

const CAMPOS = [
  "Palavra", "Leitura", "Traducao", "Classe",
  "Exemplo", "ExemploLeitura", "ExemploTraducao",
  "AudioPalavra", "AudioExemplo",
];
const I = Object.fromEntries(CAMPOS.map((c, i) => [c, i]));

// Os 3 tipos de cartão. "exige" = campos que precisam estar preenchidos
// para o cartão existir (sem áudio, não há cartão de audição).
export const TIPOS_DE_CARTAO = [
  {
    nome: "1. Leitura (palavra → significado)",
    exige: ["Palavra"],
    frente: `<div class="rotulo">Leia</div><div class="palavra">{{Palavra}}</div>`,
    verso: `{{FrontSide}}<hr id="answer">
<div class="leitura">{{Leitura}}</div>
<div class="traducao">{{Traducao}} <span class="classe">{{Classe}}</span></div>
{{AudioPalavra}}
<div class="exemplo"><div class="frase">{{Exemplo}}</div><div class="suave">{{ExemploLeitura}}</div><div class="suave">{{ExemploTraducao}}</div>{{AudioExemplo}}</div>`,
  },
  {
    nome: "2. Audição (som → palavra)",
    exige: ["AudioPalavra"],
    frente: `<div class="rotulo">O que você ouviu?</div>{{AudioPalavra}}`,
    verso: `{{FrontSide}}<hr id="answer">
<div class="palavra">{{Palavra}}</div>
<div class="leitura">{{Leitura}}</div>
<div class="traducao">{{Traducao}}</div>`,
  },
  {
    nome: "3. Produção (português → palavra)",
    exige: ["Traducao"],
    frente: `<div class="rotulo">Como se diz?</div><div class="traducao grande">{{Traducao}}</div><div class="suave">{{Classe}}</div>`,
    verso: `{{FrontSide}}<hr id="answer">
<div class="palavra">{{Palavra}}</div>
<div class="leitura">{{Leitura}}</div>
{{AudioPalavra}}`,
  },
];

// Visual dos cartões dentro do Anki, com as cores do Karta
const CSS = `.card { font-family: "Figtree", Arial, sans-serif; text-align: center; color: #1D1B2E; background: #FFFFFF; padding: 24px; }
.rotulo { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #4A4760; margin-bottom: 12px; }
.palavra { font-family: "Noto Serif SC", serif; font-size: 64px; }
.leitura { font-size: 28px; font-weight: 700; margin: 8px 0 4px; }
.traducao { font-size: 22px; }
.traducao.grande { font-size: 40px; font-weight: 700; }
.classe { font-size: 13px; border: 1.5px solid #1D1B2E; border-radius: 999px; padding: 2px 10px; }
.exemplo { background: #F1F6FF; border-radius: 16px; padding: 16px; margin-top: 20px; }
.frase { font-family: "Noto Serif SC", serif; font-size: 24px; }
.suave { color: #4A4760; font-size: 16px; margin-top: 4px; }`;

// Mesmas tabelas que o Anki cria (formato de coleção versão 11)
const ESQUEMA = `
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
// Serve para os IDs não mudarem entre exportações do mesmo baralho.
function hashNumero(texto) {
  let h = 2166136261;
  for (const ch of texto) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
const idEstavel = (texto) => 2 ** 30 + (hashNumero(texto) % 2 ** 30);

// O Anki guarda um "checksum" do primeiro campo para achar duplicatas:
// os 8 primeiros dígitos hexadecimais do SHA-1, como número.
async function checksum(texto) {
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(texto));
  const hex = [...new Uint8Array(hash)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
  return parseInt(hex, 16);
}

const escaparHtml = (t = "") =>
  String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ID_MODELO = idEstavel("karta-modelo-v1");

// obterAudio(cartaId, "palavra" | "exemplo") -> Uint8Array | null
export async function montarApkg({ SQL, JSZip, baralho, idioma, obterAudio }) {
  const agoraMs = Date.now();
  const agoraS = Math.floor(agoraMs / 1000);
  const idBaralhoAnki = idEstavel(`baralho:${baralho.id}`);
  const nomeBaralho = `Karta::${idioma.nome}::${baralho.tema} (${baralho.nivel})`;

  const modelo = {
    id: String(ID_MODELO),
    name: "Karta (3 cartões)",
    type: 0,
    mod: agoraS,
    usn: -1,
    sortf: 0,
    did: idBaralhoAnki,
    tags: [],
    vers: [],
    latexsvg: false,
    latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    latexPost: "\\end{document}",
    css: CSS,
    flds: CAMPOS.map((name, ord) => ({ name, ord, font: "Arial", media: [], rtl: false, size: 20, sticky: false })),
    tmpls: TIPOS_DE_CARTAO.map((t, ord) => ({
      name: t.nome, ord, qfmt: t.frente, afmt: t.verso, bqfmt: "", bafmt: "", bfont: "", bsize: 0, did: null,
    })),
    req: TIPOS_DE_CARTAO.map((t, ord) => [ord, "all", t.exige.map((c) => I[c])]),
  };

  const baralhoPadrao = {
    id: 1, name: "Default", conf: 1, desc: "", dyn: 0, collapsed: false, usn: 0, mod: agoraS,
    extendNew: 10, extendRev: 50, newToday: [0, 0], revToday: [0, 0], lrnToday: [0, 0], timeToday: [0, 0],
  };
  const baralhos = {
    1: baralhoPadrao,
    [idBaralhoAnki]: { ...baralhoPadrao, id: idBaralhoAnki, name: nomeBaralho, desc: `Gerado pelo Karta com ${baralho.modelo || "Gemini"}.`, usn: -1 },
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
    activeDecks: [1], curDeck: 1, curModel: String(ID_MODELO), addToCur: true, collapseTime: 1200,
    dueCounts: true, estTimes: true, newBury: true, newSpread: 0, nextPos: 1, sortBackwards: false,
    sortType: "noteFld", timeLim: 0,
  };

  const db = new SQL.Database();
  db.exec(ESQUEMA);
  db.run("INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '{}')", [
    agoraS, agoraMs, agoraMs,
    JSON.stringify(conf), JSON.stringify({ [ID_MODELO]: modelo }), JSON.stringify(baralhos), JSON.stringify(configuracaoDeEstudo),
  ]);

  const midia = {};      // { "0": "nome.wav", ... }
  const arquivos = [];   // [{ indice, bytes }]
  const resumo = { notas: 0, cartoes: 0, audios: 0, porTipo: TIPOS_DE_CARTAO.map(() => 0) };
  const tags = ` karta ${baralho.idioma} ${baralho.nivel.replace(/\s+/g, "")} `;

  for (const [i, carta] of baralho.cartas.entries()) {
    // Áudios: entram como [sound:arquivo] e o arquivo vai junto no ZIP
    const som = {};
    for (const campo of ["palavra", "exemplo"]) {
      const bytes = await obterAudio(carta.id, campo);
      if (!bytes) { som[campo] = ""; continue; }
      const nome = `karta_${carta.id}_${campo}.wav`;
      const indice = String(arquivos.length);
      midia[indice] = nome;
      arquivos.push({ indice, bytes });
      som[campo] = `[sound:${nome}]`;
      resumo.audios++;
    }

    const valores = [
      escaparHtml(carta.palavra), escaparHtml(carta.leitura), escaparHtml(carta.traducao), escaparHtml(carta.classe),
      escaparHtml(carta.exemplo), escaparHtml(carta.exemploLeitura), escaparHtml(carta.exemploTraducao),
      som.palavra, som.exemplo,
    ];
    const idNota = agoraMs + i * 10;
    db.run("INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')", [
      idNota, `karta-${carta.id}`, ID_MODELO, agoraS, tags,
      valores.join(SEPARADOR), valores[0], await checksum(valores[0]),
    ]);
    resumo.notas++;

    // Um cartão para cada tipo cujos campos exigidos estão preenchidos
    TIPOS_DE_CARTAO.forEach((tipo, ord) => {
      if (!tipo.exige.every((c) => valores[I[c]])) return;
      db.run("INSERT INTO cards VALUES (?, ?, ?, ?, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')", [
        agoraMs + 1_000_000 + i * 10 + ord, idNota, idBaralhoAnki, ord, agoraS, i + 1,
      ]);
      resumo.cartoes++;
      resumo.porTipo[ord]++;
    });
  }

  const zip = new JSZip();
  zip.file("collection.anki2", db.export());
  db.close();
  zip.file("media", JSON.stringify(midia));
  for (const { indice, bytes } of arquivos) zip.file(indice, bytes);

  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return { bytes, resumo, nomeBaralho };
}
