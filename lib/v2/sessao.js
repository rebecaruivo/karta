// ─────────────────────────────────────────────────────────────
// FILA DO DIA (v2) com a regra das cartas irmãs
//
// Cartas irmãs = cartas da mesma palavra (mesmo conceito), em pontes diferentes.
// Se 水 aparece em "Palavra → Significado", a carta "Áudio → Palavra" logo depois
// fica fácil demais: uma entrega a resposta da outra.
// Regra (como no Anki): no máximo UMA carta por palavra por dia; as irmãs ficam
// "enterradas" até o dia seguinte. Todas as cartas continuam existindo (o documento
// diz "sem pré-requisitos"); a regra só espaça a apresentação.
// ─────────────────────────────────────────────────────────────

import { CATALOGO_PONTES } from "./pontes.js";

const ORDEM_PONTE = Object.fromEntries(CATALOGO_PONTES.map((p) => [p.id, p.ordem]));
const diaLocal = (d) => new Date(d).toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso do navegador

export function montarFilaDoDia(cartas, { agora = new Date(), limiteNovas = 20 } = {}) {
  const hoje = diaLocal(agora);

  // Palavras que já tiveram alguma carta estudada hoje: as irmãs não aparecem mais hoje
  const estudadasHoje = new Set(cartas.filter((c) => c.last_review_at && diaLocal(c.last_review_at) === hoje).map((c) => c.concept_id));

  const vencidas = cartas.filter((c) => !c.suspended && new Date(c.due_at) <= agora);
  // Revisões primeiro (as mais atrasadas antes), depois as novas na ordem proposta das pontes
  vencidas.sort((a, b) => {
    const novaA = a.state === "NEW", novaB = b.state === "NEW";
    if (novaA !== novaB) return novaA ? 1 : -1;
    if (!novaA) return new Date(a.due_at) - new Date(b.due_at);
    return (ORDEM_PONTE[a.bridge_template_id] ?? 99) - (ORDEM_PONTE[b.bridge_template_id] ?? 99);
  });

  const fila = [];
  const enterradas = [];
  const usadas = new Set();
  let novas = 0;
  for (const c of vencidas) {
    // A carta que você mesma estudou hoje (e errou, por isso voltou) não é irmã: ela pode voltar.
    // As outras cartas da mesma palavra continuam enterradas até amanhã.
    const elaMesmaHoje = c.last_review_at && diaLocal(c.last_review_at) === hoje;
    if (usadas.has(c.concept_id) || (estudadasHoje.has(c.concept_id) && !elaMesmaHoje)) { enterradas.push(c); continue; }
    if (c.state === "NEW") {
      if (novas >= limiteNovas) continue; // passou do limite de novas do dia
      novas++;
    }
    usadas.add(c.concept_id);
    fila.push(c);
  }
  return { fila, enterradas };
}
