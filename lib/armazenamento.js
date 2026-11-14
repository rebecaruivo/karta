// Onde os baralhos ficam guardados: no próprio navegador (localStorage).
// Vantagem: nada de banco de dados nem login no MVP.
// Limite: os dados ficam só neste navegador, neste computador.

const CHAVE = "karta:baralhos";

export function listarBaralhos() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || "[]");
  } catch {
    return [];
  }
}

export function obterBaralho(id) {
  return listarBaralhos().find((b) => b.id === id) || null;
}

export function salvarBaralho(baralho) {
  const todos = listarBaralhos().filter((b) => b.id !== baralho.id);
  todos.unshift(baralho);
  localStorage.setItem(CHAVE, JSON.stringify(todos));
}

export function excluirBaralho(id) {
  const todos = listarBaralhos().filter((b) => b.id !== id);
  localStorage.setItem(CHAVE, JSON.stringify(todos));
}
