// ─────────────────────────────────────────────────────────────
// REPETIÇÃO ESPAÇADA (v2) com FSRS, pela biblioteca oficial ts-fsrs (versão 6).
// Questão em aberto 10.2.1 do documento: escolhido FSRS.
//
// O modelo de dados do CauanGS (docs/modelagem) já usa os nomes do FSRS
// (stability, difficulty, due_at). Diferenças tratadas aqui:
// - FSRS tem 4 estados (New, Learning, Review, Relearning); o modelo tem 3.
//   Relearning (errar uma carta que já sabia) vira LEARNING.
// - Campos internos do FSRS que o modelo não tem ficam em `srs_extra` (proposta).
// ─────────────────────────────────────────────────────────────

import { fsrs, generatorParameters, createEmptyCard, Rating, State } from "ts-fsrs";

// Retenção desejada de 90%: o FSRS agenda cada revisão para quando a chance
// de lembrar cair para cerca de 90%. "fuzz" espalha um pouco as datas para as
// revisões não se amontoarem no mesmo dia.
const agendador = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }));

// Os 3 botões do Karta -> notas do FSRS (decisão de 18/11).
// Os nomes "Difícil · Médio · Fácil" foram mantidos, e cada um passou a ter o efeito que o nome sugere:
// Difícil = Hard (lembrou com esforço: intervalo curto), Médio = Good, Fácil = Easy.
// Não há botão de "errei" (Again): quem não lembra marca Difícil, que conta como acerto com intervalo curto.
// Troca consciente: a sessão fica mais simples, mas o FSRS pode superestimar o que a pessoa sabe.
// As chaves (nao/acho/decorei) ficaram as mesmas para não quebrar os eventos já registrados.
export const RESPOSTAS = {
  nao: { rotulo: "Difícil", nota: Rating.Hard },
  acho: { rotulo: "Médio", nota: Rating.Good },
  decorei: { rotulo: "Fácil", nota: Rating.Easy },
};

const PARA_MODELO = { [State.New]: "NEW", [State.Learning]: "LEARNING", [State.Review]: "REVIEW", [State.Relearning]: "LEARNING" };

// user_card (modelo) -> cartão do FSRS
function paraFsrs(carta, agora) {
  const x = carta.srs_extra;
  if (!x) return createEmptyCard(agora); // carta nova, nunca estudada
  return {
    due: new Date(carta.due_at),
    stability: carta.stability,
    difficulty: carta.difficulty,
    scheduled_days: x.scheduled_days ?? 0,
    learning_steps: x.learning_steps ?? 0,
    reps: carta.reps ?? 0,
    lapses: carta.lapses ?? 0,
    state: x.estado_fsrs,
    last_review: carta.last_review_at ? new Date(carta.last_review_at) : undefined,
  };
}

// cartão do FSRS -> user_card (modelo)
function deFsrs(carta, c) {
  return {
    ...carta,
    state: PARA_MODELO[c.state],
    stability: c.stability,
    difficulty: c.difficulty,
    due_at: c.due.toISOString(),
    last_review_at: c.last_review ? new Date(c.last_review).toISOString() : null,
    reps: c.reps,
    lapses: c.lapses,
    srs_extra: { estado_fsrs: c.state, scheduled_days: c.scheduled_days, learning_steps: c.learning_steps },
  };
}

// Aplica a resposta e devolve a carta com a próxima revisão agendada
export function responder(carta, resposta, agora = new Date()) {
  const { card } = agendador.next(paraFsrs(carta, agora), agora, RESPOSTAS[resposta].nota);
  return deFsrs(carta, card);
}

// Quando a carta voltaria em cada botão (para mostrar "10 min", "3 d" embaixo dos botões)
export function previsao(carta, agora = new Date()) {
  return Object.fromEntries(Object.keys(RESPOSTAS).map((r) => [r, new Date(responder(carta, r, agora).due_at) - agora]));
}

export function formatarIntervalo(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} d`;
  const m = Math.round(d / 30);
  return m < 12 ? `${m} m` : `${(d / 365).toFixed(1).replace(".", ",")} a`;
}
