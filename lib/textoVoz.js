// Decide QUAL texto vai para a voz (TTS) de cada carta.
//
// Problema encontrado no teste: o japonês 水 (água) saiu falado em mandarim.
// O kanji é escrito igual nas duas línguas e, sozinho, o modelo de voz não
// tem como saber o idioma. Palavras com hiragana não têm esse problema,
// porque o hiragana só existe em japonês.
//
// Solução: no japonês, a voz recebe a leitura em hiragana (みず) quando o
// texto original não tem kana. Nos outros idiomas, o texto original.

const TEM_KANA = /[぀-ヿ]/; // hiragana e katakana

// "みず (mizu)" -> "みず"
const parteKana = (leitura = "") => leitura.split("(")[0].trim();

export function textoParaVoz(carta, idioma, campo) {
  const original = campo === "palavra" ? carta.palavra : carta.exemplo;
  if (idioma !== "japones" || TEM_KANA.test(original)) return original;
  const leitura = parteKana(campo === "palavra" ? carta.leitura : carta.exemploLeitura);
  return TEM_KANA.test(leitura) ? leitura : original;
}
