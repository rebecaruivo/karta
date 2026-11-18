// Perfis de idioma da v2. Reaproveitam nome, níveis, sigla e voz de lib/idiomas.js
// e acrescentam o que só a v2 usa: código ISO, formato de leitura e limite da frase.

import { IDIOMAS } from "../idiomas.js";

const HANZI = /^[㐀-鿿]+$/u;
const JAPONES = /^[\u3040-\u30ff\u3400-\u9fff々〆ヵヶー・]+$/u;
const LATINO = /^[\p{L}\p{M}][\p{L}\p{M}'’ -]*$/u;

export const IDIOMAS_V2 = {
  zh: {
    ...IDIOMAS.mandarim,
    codigo: "zh",
    chave: "mandarim",
    temLeitura: true,
    rotuloLeitura: "Pinyin",
    escritaRegex: HANZI,
    limiteFrase: { tipo: "caracteres", max: 15 },
    codigoTts: "zh_CN",
  },
  ja: {
    ...IDIOMAS.japones,
    codigo: "ja",
    chave: "japones",
    temLeitura: true,
    rotuloLeitura: "Leitura",
    escritaRegex: JAPONES,
    limiteFrase: { tipo: "caracteres", max: 20 },
    codigoTts: "ja_JP",
  },
  en: {
    ...IDIOMAS.ingles,
    codigo: "en",
    chave: "ingles",
    temLeitura: false, // pronúncia escrita (IPA) só no mandarim e no japonês, por decisão de produto
    escritaRegex: LATINO,
    limiteFrase: { tipo: "palavras", max: 12 },
    codigoTts: "en_US",
  },
  fr: {
    ...IDIOMAS.frances,
    codigo: "fr",
    chave: "frances",
    temLeitura: false, // pronúncia escrita (IPA) só no mandarim e no japonês, por decisão de produto
    temGenero: true, // o artigo não vai na palavra (atrapalha a lacuna); o gênero fica num campo próprio
    escritaRegex: LATINO,
    limiteFrase: { tipo: "palavras", max: 12 },
    codigoTts: "fr_FR",
  },
  es: {
    ...IDIOMAS.espanhol,
    codigo: "es",
    chave: "espanhol",
    temLeitura: false, // pronúncia escrita (IPA) só no mandarim e no japonês, por decisão de produto
    temGenero: true,
    escritaRegex: LATINO,
    limiteFrase: { tipo: "palavras", max: 12 },
    codigoTts: "es_ES",
  },
};

export const IDIOMA_PADRAO = "zh";
export const IDIOMAS_V2_LISTA = Object.values(IDIOMAS_V2);

export function codigoDe(valor) {
  if (typeof valor !== "string") return null;
  if (IDIOMAS_V2[valor]) return valor;
  return Object.entries(IDIOMAS_V2).find(([, cfg]) => cfg.chave === valor)?.[0] ?? null;
}

export function idiomaOpcional(valor) {
  const codigo = codigoDe(valor);
  return codigo ? IDIOMAS_V2[codigo] : null;
}

export function idiomaV2(valor) {
  return idiomaOpcional(valor) ?? IDIOMAS_V2[IDIOMA_PADRAO];
}

export const ehMandarim = (cfg) => cfg?.codigo === "zh";
export const classeEscrita = (cfg) => cfg?.escritaPropria ? (cfg.codigo === "ja" ? "v2-cjk" : "z") : "";

// ── Tipografia das cartas ─────────────────────────────────────
// O japonês (e o mandarim) é a base 1,0×. As línguas latinas descem um pouco
// e sobem o peso: o x-height latino é ~50% do ideograma, então o mesmo corpo
// pareceria mais claro. Os corpos abaixo são os mesmos no baralho e no estudo.
export const BASE_ALVO = 56;       // palavra-alvo (japonês/mandarim)
export const BASE_FRASE = 30;      // frase-alvo (japonês/mandarim)
export const BASE_LEITURA = 20;
export const BASE_SIGNIFICADO = 32; // tradução não acompanha o corpo da palavra

const TIPOGRAFIA_CJK = {
  alvo: { escala: 1, peso: 400, entrelinha: 1.15, espacamento: "0" },
  frase: { escala: 1, peso: 400, entrelinha: 1.5, espacamento: "0" },
  significado: { escala: 1, peso: 600, entrelinha: 1.15, espacamento: "0" },
  leitura: { escala: 1, peso: 400, entrelinha: 1.3, espacamento: "0" },
};

const TIPOGRAFIA_LATINA = {
  alvo: { escala: 0.9, peso: 600, entrelinha: 1.3, espacamento: "-0.01em" },
  frase: { escala: 0.92, peso: 500, entrelinha: 1.3, espacamento: "0" },
  significado: { escala: 1, peso: 600, entrelinha: 1.15, espacamento: "0" },
  leitura: { escala: 0.9, peso: 400, entrelinha: 1.3, espacamento: "0" },
};

export function tipografiaDe(cfg) {
  return cfg?.escritaPropria ? TIPOGRAFIA_CJK : TIPOGRAFIA_LATINA;
}

const contarLetras = (texto) => Array.from(String(texto ?? "").replace(/\s/g, "")).length;

// Palavras longas latinas: degraus de 8% por faixa, com piso em 0,7×.
// É melhor reduzir do que quebrar a palavra-alvo.
function fatorComprimento(texto) {
  const n = contarLetras(texto);
  if (n <= 8) return 1;
  if (n <= 12) return 0.92;
  if (n <= 16) return 0.84;
  if (n <= 20) return 0.76;
  return 0.7;
}

export function tamanhoDoAlvo(texto, cfg) {
  const t = tipografiaDe(cfg);
  const escala = cfg?.escritaPropria ? t.alvo.escala : Math.max(0.7, t.alvo.escala * fatorComprimento(texto));
  return Math.round(BASE_ALVO * escala);
}

export const corpoDaFrase = (cfg) => Math.round(BASE_FRASE * tipografiaDe(cfg).frase.escala);
export const corpoDoSignificado = (cfg) => Math.round(BASE_SIGNIFICADO * tipografiaDe(cfg).significado.escala);
export const corpoDaLeitura = (cfg, { frase = false } = {}) =>
  Math.round(BASE_LEITURA * tipografiaDe(cfg).leitura.escala * (frase ? 0.8 : 1));

export const leituraDe = (metadata) => metadata?.leitura ?? metadata?.pinyin ?? "";

// Gênero gramatical (francês e espanhol): "m" ou "f" no metadata da faceta WORD
const GENEROS = { m: { curto: "m.", longo: "masculino" }, f: { curto: "f.", longo: "feminino" } };
export const generoCurto = (metadata) => GENEROS[metadata?.genero]?.curto ?? "";
// "substantivo" + f → "substantivo feminino"
export const classeComGenero = (metadata) =>
  [metadata?.pos, GENEROS[metadata?.genero]?.longo].filter(Boolean).join(" ");

// Japonês: "たべる (taberu)" vira "たべる · taberu" na linha de apoio.
export function leituraParaExibir(texto, cfg) {
  if (cfg?.codigo !== "ja") return texto;
  const m = String(texto ?? "").match(/^(.+?)\s*[（(](.+?)[）)]\s*$/);
  return m ? `${m[1].trim()} · ${m[2].trim()}` : texto;
}

const TEM_KANA = /[぀-ヿ]/;
const parteKana = (leitura = "") => String(leitura).split("(")[0].trim();

// Japonês escrito só com kanji pode sair falado em mandarim; nesse caso a voz recebe a leitura em hiragana.
export function textoParaVoz(texto, metadata, cfg) {
  if (cfg?.codigo !== "ja" || TEM_KANA.test(texto || "")) return texto;
  const leitura = parteKana(leituraDe(metadata));
  return TEM_KANA.test(leitura) ? leitura : texto;
}

export function tamanhoDaFrase(cfg, frase = "") {
  if (cfg.limiteFrase.tipo === "palavras") {
    return String(frase).trim().split(/\s+/).filter(Boolean).length;
  }
  return Array.from(String(frase)).length;
}

export function descricaoLimiteFrase(cfg) {
  const { tipo, max } = cfg.limiteFrase;
  return tipo === "palavras" ? `${max} palavras` : `${max} caracteres`;
}
