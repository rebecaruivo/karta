// Testes da repetição espaçada (FSRS). Uso: npm run testar:srs
import { responder, previsao, formatarIntervalo } from "../lib/v2/srs.js";

let falhas = 0;
const conferir = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) falhas++; };
const dias = (a, b) => (new Date(b) - new Date(a)) / 86400000;

const t0 = new Date("2026-11-15T15:00:00");
const nova = { id: "uc1", concept_id: "c1", bridge_template_id: "WORD_TO_MEANING", state: "NEW", stability: null, difficulty: null, due_at: t0.toISOString(), last_review_at: null, reps: 0, lapses: 0, suspended: false };

console.log("— Primeira resposta (carta nova)");
const p = previsao(nova, t0);
console.log(`   previsão: Difícil ${formatarIntervalo(p.nao)} · Médio ${formatarIntervalo(p.acho)} · Fácil ${formatarIntervalo(p.decorei)}`);
conferir(p.nao <= p.acho && p.acho <= p.decorei, "quanto melhor a resposta, mais tarde a carta volta");
const g1 = responder(nova, "decorei", t0);
conferir(g1.stability > 0 && g1.difficulty > 0, "depois da 1ª resposta, a carta ganha stability e difficulty");
conferir(["LEARNING", "REVIEW"].includes(g1.state) && g1.reps === 1 && g1.last_review_at === t0.toISOString(), "estado, número de revisões e data da revisão são registrados");
conferir(g1.srs_extra && typeof g1.srs_extra.estado_fsrs === "number", "campos internos do FSRS ficam em srs_extra");
conferir(responder(nova, "nao", t0).state === "LEARNING", "Difícil numa carta nova: fica em aprendizado (volta em minutos)");

console.log("\n— Várias respostas \"Fácil\" seguidas");
let c = g1, intervalos = [];
for (let i = 0; i < 5; i++) {
  const agora = new Date(c.due_at);
  const prox = responder(c, "decorei", agora);
  intervalos.push(dias(agora, prox.due_at));
  c = prox;
}
console.log("   intervalos (dias):", intervalos.map((d) => d.toFixed(1)).join(" → "));
conferir(c.state === "REVIEW", "depois de algumas respostas boas, a carta fica em REVIEW (não existe \"Dominada\")");
conferir(intervalos.slice(1).every((d, i) => d > intervalos[i]), "o intervalo cresce a cada resposta boa");

console.log("\n— \"Difícil\" numa carta que já sabia (não existe botão de errar)");
const agora = new Date(c.due_at);
const dificil = responder(c, "nao", agora);
const medio = responder(c, "acho", agora);
const facil = responder(c, "decorei", agora);
conferir(dificil.state === "REVIEW" && dificil.lapses === c.lapses, "Difícil conta como acerto: continua em REVIEW e não conta lapso");
conferir(dias(agora, dificil.due_at) < dias(agora, medio.due_at) && dias(agora, medio.due_at) < dias(agora, facil.due_at), "Difícil < Médio < Fácil no próximo intervalo");
conferir(dificil.difficulty > c.difficulty, "Difícil aumenta a dificuldade estimada da carta");

console.log("\n— Formato dos intervalos");
conferir(formatarIntervalo(10 * 60000) === "10 min" && formatarIntervalo(3 * 86400000) === "3 d", "10 min, 3 d");

console.log(falhas ? `\n${falhas} teste(s) falharam.` : "\nTodos os testes passaram.");
process.exit(falhas ? 1 : 0);
