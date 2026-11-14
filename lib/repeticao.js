// ─────────────────────────────────────────────────────────────
// REPETIÇÃO ESPAÇADA (versão simples, inspirada no método do Anki)
// Ideia: quanto melhor você lembra de uma carta, mais tempo ela
// demora para voltar. O que você erra volta logo.
// Cada carta guarda:
//   intervalo      -> quantos dias até a próxima revisão
//   proximaRevisao -> data (ISO) em que a carta volta
//   status         -> nova | aprendendo | dominada
// ─────────────────────────────────────────────────────────────

const DIA = 24 * 60 * 60 * 1000;
export const DIAS_PARA_DOMINAR = 7; // intervalo a partir do qual a carta é "dominada"

// Respostas possíveis, na mesma ordem dos botões da tela
export const RESPOSTAS = {
  nao: "Não sei",
  acho: "Acho que sei",
  decorei: "Decorei",
};

// Calcula o novo estado da carta a partir da resposta
export function responder(carta, resposta, agora = new Date()) {
  const anterior = carta.intervalo || 0;
  let intervalo;

  if (resposta === "nao") intervalo = 0;                         // volta ainda nesta sessão
  else if (resposta === "acho") intervalo = Math.max(1, Math.round(anterior * 1.2)); // cresce devagar
  else intervalo = anterior === 0 ? 3 : Math.round(anterior * 2.5); // cresce rápido

  const status =
    intervalo >= DIAS_PARA_DOMINAR ? "dominada" : "aprendendo";

  return {
    ...carta,
    intervalo,
    status,
    proximaRevisao: new Date(agora.getTime() + intervalo * DIA).toISOString(),
    revisoes: (carta.revisoes || 0) + 1,
  };
}

// Uma carta está "para hoje" se é nova ou se a data de revisão já chegou
export function paraRevisar(carta, agora = new Date()) {
  if (!carta.proximaRevisao) return true;
  return new Date(carta.proximaRevisao) <= agora;
}

// Monta a fila da sessão: primeiro as atrasadas, depois as novas (com limite)
export function montarFila(cartas, limiteNovas = 10, agora = new Date()) {
  const vencidas = cartas.filter((c) => c.proximaRevisao && paraRevisar(c, agora));
  const novas = cartas.filter((c) => !c.proximaRevisao).slice(0, limiteNovas);
  return [...vencidas, ...novas].map((c) => c.id);
}
