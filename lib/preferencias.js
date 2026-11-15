// Preferências do usuário, guardadas só neste navegador.
//
// Modo de áudio: de onde vem a voz das cartas.
//   cota_e_navegador (padrão): grava com o Gemini; sem gravação (ou cota esgotada), voz do navegador
//   cota:                      só gravações do Gemini; sem gravação, a carta avisa que falta gerar
//   navegador:                 só a voz do navegador; nunca gasta cota
export const MODOS_AUDIO = {
  cota_e_navegador: { rotulo: "Usar a cota e, se esgotar, a voz do navegador", descricao: "Gravações naturais do Gemini. Enquanto uma gravação não existe, ou se a cota acabar, a carta usa a voz do aparelho." },
  cota: { rotulo: "Usar só a cota", descricao: "Só gravações do Gemini, que vão junto para o Anki. Carta sem gravação fica sem som até você gerar os áudios." },
  navegador: { rotulo: "Usar só a voz do navegador", descricao: "Grátis e instantâneo, sem gastar cota. A qualidade depende do aparelho, e não vai para o Anki." },
};
const CHAVE = "karta:modo-audio";
export const MODO_PADRAO = "cota_e_navegador";

export function obterModoAudio() {
  try { const m = localStorage.getItem(CHAVE); return MODOS_AUDIO[m] ? m : MODO_PADRAO; } catch { return MODO_PADRAO; }
}
export function salvarModoAudio(modo) {
  if (MODOS_AUDIO[modo]) localStorage.setItem(CHAVE, modo);
}
// Regras derivadas, usadas pelas telas
export const podeGerarAudio = (modo) => modo !== "navegador";
export const usaGravacao = (modo) => modo !== "navegador";
export const usaVozDoNavegador = (modo) => modo !== "cota";
