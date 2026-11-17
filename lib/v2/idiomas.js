// Perfis de idioma da v2. Reaproveitam nome, níveis, sigla e voz de lib/idiomas.js
// e acrescentam o que só a v2 usa: código ISO, formato de leitura e limite da frase.

import { IDIOMAS } from "../idiomas.js";

const HANZI = /^[㐀-鿿]+$/u;
const JAPONES = /^[\u3040-\u30ff\u3400-\u9fff々〆ヵヶー・]+$/u;
const LATINO = /^[\p{L}\p{M}][\p{L}\p{M}'’ -]*$/u;

const semLeitura = { temLeitura: false, rotuloLeitura: null, regraLeitura: null };

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
    ...semLeitura,
    codigo: "en",
    chave: "ingles",
    escritaRegex: LATINO,
    limiteFrase: { tipo: "palavras", max: 12 },
    codigoTts: "en_US",
  },
  fr: {
    ...IDIOMAS.frances,
    ...semLeitura,
    codigo: "fr",
    chave: "frances",
    escritaRegex: LATINO,
    limiteFrase: { tipo: "palavras", max: 12 },
    codigoTts: "fr_FR",
  },
  es: {
    ...IDIOMAS.espanhol,
    ...semLeitura,
    codigo: "es",
    chave: "espanhol",
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

export const leituraDe = (metadata) => metadata?.leitura ?? metadata?.pinyin ?? "";

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
