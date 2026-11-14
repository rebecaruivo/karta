// Regras para não repetir informação na carta.
// No japonês, a leitura vem como "hiragana (romaji)". Se a palavra ou a frase
// já está toda em kana, a parte em hiragana da leitura é igual ao próprio texto.

// "つめたいみずをください (tsumetai mizu o kudasai)" -> "つめたいみずをください"
export const parteKana = (leitura = "") => leitura.split("(")[0].trim();

// Ignora espaços e pontuação na comparação: "ください。" == "ください"
const normalizar = (t = "") => t.replace(/[\s。、，．・！？!?.,「」]/g, "");

// A leitura repete o texto? (ex.: frase toda em hiragana)
export function leituraRepete(texto, leitura) {
  const kana = normalizar(parteKana(leitura));
  return Boolean(kana) && kana === normalizar(texto);
}
