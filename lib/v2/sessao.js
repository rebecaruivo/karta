// ─────────────────────────────────────────────────────────────
// FILA DE ESTUDO (v2)
// Decisão de produto (15/11): todas as cartas do baralho ficam disponíveis desde
// a criação, a fila vem embaralhada e não há limite diário de estudo.
// (Substitui a regra anterior de "uma carta irmã por palavra por dia".)
// Entram na fila as cartas não suspensas cuja próxima revisão já chegou.
// ─────────────────────────────────────────────────────────────

// Embaralhamento de Fisher-Yates: cada ordem tem a mesma chance.
// "aleatorio" pode ser trocado nos testes por uma sequência previsível.
export function embaralhar(lista, aleatorio = Math.random) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function montarFila(cartas, { agora = new Date(), aleatorio = Math.random } = {}) {
  const disponiveis = cartas.filter((c) => !c.suspended && new Date(c.due_at) <= agora);
  return embaralhar(disponiveis, aleatorio);
}
