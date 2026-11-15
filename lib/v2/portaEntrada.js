// ─────────────────────────────────────────────────────────────
// PORTA DE ENTRADA (v2) — seção 3.1 do documento de arquitetura
// Trata a lista de palavras digitada (modo B) antes do Módulo 2.
// Não é um módulo de negócio: só normaliza e valida.
// Saída: a mesma estrutura do Módulo 1 (WordList), com origin = "user".
// ─────────────────────────────────────────────────────────────

export const LIMITES = { minPalavras: 1, maxPalavras: 50, maxCaracteres: 40, maxTema: 80 };

// "banco (dinheiro)" -> { gloss: "banco", sense_hint: "dinheiro" }
function separarDica(item) {
  const m = item.match(/^(.*?)\s*\((.+)\)\s*$/);
  return m ? { gloss: m[1].trim(), sense_hint: m[2].trim() } : { gloss: item.trim(), sense_hint: null };
}

export function lerPalavras(texto, { target_language, level }) {
  const avisos = [];
  // 1. separa por vírgula, ponto e vírgula ou quebra de linha (seção 8)
  const itens = String(texto || "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

  // 2. remove duplicadas, sem diferenciar maiúsculas
  const vistos = new Set();
  const palavras = [];
  for (const item of itens) {
    const { gloss, sense_hint } = separarDica(item);
    const chave = gloss.toLocaleLowerCase("pt-BR");
    if (!gloss) continue;
    if (vistos.has(chave)) { avisos.push(`"${gloss}" repetida, entrou uma vez só.`); continue; }
    if (gloss.length > LIMITES.maxCaracteres) { avisos.push(`"${gloss.slice(0, 20)}…" passa de ${LIMITES.maxCaracteres} caracteres e ficou de fora.`); continue; }
    vistos.add(chave);
    palavras.push({ id: `w${palavras.length + 1}`, gloss, sense_hint });
  }

  // 3. limites de quantidade
  if (palavras.length < LIMITES.minPalavras) return { erro: "Digite pelo menos uma palavra.", avisos };
  if (palavras.length > LIMITES.maxPalavras) {
    avisos.push(`Só as primeiras ${LIMITES.maxPalavras} palavras entraram.`);
    palavras.length = LIMITES.maxPalavras;
  }

  return { wordList: { origin: "user", theme: null, target_language, level, words: palavras }, avisos };
}
