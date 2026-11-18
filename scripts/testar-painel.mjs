// Testes do painel de admin: a transformação das métricas brutas no que a tela mostra (sem banco de dados).
import { montarPainel, funilComConversao, taxa, dur, fmt } from "../lib/v2/painel.js";

let falhas = 0;
const conferir = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) falhas++; };

const dia = (i) => `2026-11-${String(5 + i).padStart(2, "0")}`;
const base = {
  contas: 10, novas: 3,
  ativacao: { logado: 6, anonimo: 4 },
  wau: { logado: 3, anonimo: 2 },
  serie: Array.from({ length: 14 }, (_, i) => ({ dia: dia(i), logado: i < 7 ? 5 : 10, anonimo: i < 7 ? 5 : 5 })),
  taxas: { pctDecoreiLogado: 40, pctNaoLogado: 20, pctDecoreiAnonimo: null, pctNaoAnonimo: null },
  funil: { logado: { contas: 10, baralho: 6, estudo: 3 }, anonimo: { baralho: 4, estudo: 0 } },
  criacao: { logado: { iniciados: 5, concluidos: 4, mediana: 42, p90: 95 }, anonimo: { iniciados: 0, concluidos: 0, mediana: null, p90: null } },
  baralhos7d: 2,
  porIdioma: [{ idioma: "zh", n: 4 }, { idioma: "fr", n: 2 }, { idioma: "xx", n: 1 }],
  banco: { palavras: 1200, usos: 340, porIdioma: [{ idioma: "zh", palavras: 1000, usos: 300 }], doBanco30d: 30, palavras30d: 120 },
};

console.log("— Utilitários");
conferir(taxa(1, 4) === 25 && taxa(1, 0) === null && taxa(null, 4) === null, "taxa arredonda e não divide por zero");
conferir(dur(42) === "42s" && dur(95) === "1min 35s" && dur(null) === "—", "duração em segundos e minutos");
conferir(fmt(1200) === "1.200" && fmt(null) === "—", "números no formato brasileiro");

console.log("\n— Funil");
const f = funilComConversao([{ rotulo: "a", valor: 10 }, { rotulo: "b", valor: 6 }, { rotulo: "c", valor: 3 }]);
conferir(f[0].conversao === null && f[1].conversao === 60 && f[2].conversao === 50, "conversão é sempre sobre a etapa anterior");
conferir(f[0].largura === 100 && f[2].largura === 30, "largura da barra é sobre a primeira etapa");
conferir(funilComConversao([{ rotulo: "a", valor: 0 }, { rotulo: "b", valor: 0 }])[1].conversao === null, "funil vazio não mostra 0% enganoso");

console.log("\n— Painel montado");
const p = montarPainel(base);
conferir(p.destaques[0].valor === "5" && p.destaques[0].nota.includes("3 com conta"), "quem estudou soma com e sem conta e mostra a divisão");
conferir(p.destaques[1].valor === "105" && p.destaques[1].nota === "+50% sobre os 7 dias anteriores", "cartas de 7 dias com variação sobre a semana anterior");
conferir(p.comparacao.find((l) => l[0].startsWith("Tempo"))[1] === "42s · 1min 35s" && p.comparacao.find((l) => l[0].startsWith("Tempo"))[2] === "—", "tempo de criação: mediana · p90, traço sem dados");
conferir(p.comparacao.find((l) => l[0].startsWith("Baralhos concluídos"))[1] === "4 de 5", "concluídos dos iniciados");
conferir(p.idiomas[0].nome === "Mandarim" && p.idiomas[0].largura === 100 && p.idiomas[2].nome === "xx", "idiomas com nome por extenso (código desconhecido aparece como veio)");
conferir(p.banco.acerto === 25 && p.banco.palavras === "1.200", "banco de palavras: 25% das palavras vieram do banco");
conferir(p.vazio === false, "com dados, o painel não mostra o aviso de vazio");

const semNada = montarPainel({ ...base, serie: base.serie.map((d) => ({ ...d, logado: 0, anonimo: 0 })), baralhos7d: 0, ativacao: { logado: 0, anonimo: 0 }, banco: null, porIdioma: [] });
conferir(semNada.vazio && semNada.banco === null && semNada.destaques[1].nota === null, "sem eventos: aviso de vazio, sem banco e sem variação");

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodos os testes passaram.");
process.exit(falhas ? 1 : 0);
