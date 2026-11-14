// Chave do Gemini do VISITANTE.
// No site publicado, o servidor não tem chave própria: quem quiser gerar
// baralhos cola a sua (grátis, em aistudio.google.com/apikey). Ela fica só
// neste navegador e vai junto em cada pedido, no cabeçalho "x-gemini-key".
// O servidor usa a chave para falar com o Gemini e não a guarda.

const CHAVE = "karta:chave-gemini";

export function obterChave() {
  try { return localStorage.getItem(CHAVE) || ""; } catch { return ""; }
}
export function salvarChave(valor) {
  localStorage.setItem(CHAVE, valor.trim());
}
export function removerChave() {
  localStorage.removeItem(CHAVE);
}
// Cabeçalhos para os fetch do app: só inclui a chave se houver uma salva
export function cabecalhosComChave() {
  const chave = obterChave();
  return { "Content-Type": "application/json", ...(chave ? { "x-gemini-key": chave } : {}) };
}
