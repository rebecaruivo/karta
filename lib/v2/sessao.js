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

// Depois de embaralhar, evita duas cartas da mesma palavra em sequência: a segunda ficaria
// fácil demais (ajuste leve registrado no diário de 15/11). Quando não há outra palavra
// disponível (ex.: só sobrou uma), aceita a sequência.
export function espacarPalavras(fila) {
  const a = [...fila];
  for (let i = 1; i < a.length; i++) {
    const palavra = a[i].concept_id;
    if (palavra !== a[i - 1].concept_id) continue;
    // 1º: troca com a próxima carta de outra palavra
    const j = a.findIndex((c, k) => k > i && c.concept_id !== palavra);
    if (j !== -1) { [a[i], a[j]] = [a[j], a[i]]; continue; }
    // 2º (fim da fila, só sobrou essa palavra): volta a carta para um ponto anterior
    // em que nenhuma das duas vizinhas é da mesma palavra. Nunca antes da 1ª carta:
    // no estudo, ela é a carta que acabou de ser respondida.
    const k = a.findIndex((c, k) => k >= 1 && k < i - 1 && c.concept_id !== palavra && a[k - 1].concept_id !== palavra);
    if (k !== -1) { const [carta] = a.splice(i, 1); a.splice(k, 0, carta); }
  }
  return a;
}

// conceitos: estudar só algumas palavras (ex.: "Estudar só essas" na aba Progresso), mesmo antes da data
export function montarFila(cartas, { agora = new Date(), aleatorio = Math.random, conceitos = null } = {}) {
  const disponiveis = conceitos
    ? cartas.filter((c) => !c.suspended && conceitos.includes(c.concept_id))
    : cartas.filter((c) => !c.suspended && new Date(c.due_at) <= agora);
  return espacarPalavras(embaralhar(disponiveis, aleatorio));
}
