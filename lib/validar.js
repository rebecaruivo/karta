// O schema garante o FORMATO, mas não a QUALIDADE.
// Aqui o código confere o que o modelo devolveu antes de confiar.

import { IDIOMAS, LIMITE_CARTAS } from "./idiomas";

// Valida o que veio do formulário (nunca confie no navegador).
export function validarPedido(body) {
  const { idioma, nivel, tema, quantidade } = body || {};
  const cfg = IDIOMAS[idioma];
  if (!cfg) return "Idioma inválido.";
  if (!cfg.niveis.includes(nivel)) return "Nível inválido para esse idioma.";
  if (typeof tema !== "string" || tema.trim().length < 2 || tema.length > 80)
    return "O tema precisa ter entre 2 e 80 caracteres.";
  const n = Number(quantidade);
  if (!Number.isInteger(n) || n < 5 || n > LIMITE_CARTAS)
    return `A quantidade precisa ser entre 5 e ${LIMITE_CARTAS}.`;
  return null;
}

// Limpa a resposta do modelo: remove cartas incompletas e repetidas.
export function limparCartas(cartas) {
  const vistas = new Set();
  const limpas = [];
  const descartadas = [];
  for (const c of cartas || []) {
    const chave = (c.palavra || "").trim().toLowerCase();
    const completa = ["palavra", "leitura", "traducao", "exemplo", "exemploTraducao"].every(
      (k) => typeof c[k] === "string" && c[k].trim()
    );
    if (!completa) { descartadas.push({ palavra: c.palavra, motivo: "incompleta" }); continue; }
    if (vistas.has(chave)) { descartadas.push({ palavra: c.palavra, motivo: "repetida" }); continue; }
    vistas.add(chave);
    limpas.push(c);
  }
  return { limpas, descartadas };
}
