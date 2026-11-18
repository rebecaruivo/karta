// Testes da aba "Meu progresso" (lib/v2/progresso.js). Uso: npm run testar:progresso
import { limparAnalise, traduzirResumo, analisarProgresso, INSTRUCAO_SISTEMA } from "../lib/v2/analise.js";
import { criarRepositorio } from "../lib/v2/banco.js";
import { adaptadorMemoria, ESQUEMA } from "../lib/v2/adaptadores.js";
import { TABELAS, paraLinha, paraRegistro } from "../lib/v2/dadosServidor.js";
import { montarFila } from "../lib/v2/sessao.js";
import { montarPalavraEnriquecida } from "../lib/v2/facetas.js";
import { diaLocal, porDia, sequencia, previsao, etapa, dominio, respostas, pontosFracos, dificilPor, calcularProgresso, resumoParaIA } from "../lib/v2/progresso.js";

let falhas = 0;
const conferir = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) falhas++; };

const agora = new Date("2026-11-18T15:00:00-03:00"); // quarta, 15h em São Paulo
const h = (dias, hora = 12) => new Date(agora.getTime() - dias * 86400000 + (hora - 15) * 3600000).toISOString();
const rev = (dias, rating, concept_id = "c1", bridge = "WORD_TO_MEANING", hora = 12) =>
  ({ id: crypto.randomUUID(), deck_id: "d1", card_id: `uc-${concept_id}-${bridge}`, concept_id, bridge_template_id: bridge, rating, respondido_em: h(dias, hora) });

console.log("— Dias e sequência");
conferir(diaLocal("2026-11-18T01:30:00Z") === "2026-11-17", "o dia é contado no fuso de São Paulo (01h30 UTC ainda é o dia anterior)");
const r1 = [rev(0, "acho"), rev(1, "nao"), rev(1, "decorei"), rev(2, "acho"), rev(4, "decorei")];
const s = sequencia(r1, { agora });
conferir(s.atual === 3 && s.estudouHoje, "hoje, ontem e anteontem: 3 dias seguidos (o buraco de 3 dias atrás interrompe)");
conferir(sequencia([rev(1, "acho"), rev(2, "acho")], { agora }).atual === 2, "ainda não estudou hoje: a sequência de ontem continua valendo");
conferir(sequencia([rev(2, "acho")], { agora }).atual === 0, "sem estudo ontem nem hoje: sequência zerada");

const serie = porDia(r1, { agora });
conferir(serie.length === 14 && serie.at(-1).dia === "2026-11-18" && serie.at(-1).total === 1, "14 dias, terminando hoje");
conferir(serie.at(-2).total === 2 && serie.at(-2).nao === 1 && serie.at(-2).decorei === 1, "cada dia separa as respostas (Difícil, Médio, Fácil)");

console.log("\n— Previsão e domínio");
const carta = (extra) => ({ id: crypto.randomUUID(), deck_id: "d1", concept_id: "c1", suspended: false, state: "REVIEW", stability: 5, due_at: agora.toISOString(), ...extra });
const cartas = [
  carta({ due_at: h(3) }),                                  // atrasada → hoje
  carta({ due_at: new Date(agora.getTime() + 3600000).toISOString() }), // hoje mais tarde
  carta({ due_at: new Date(agora.getTime() + 2 * 86400000).toISOString() }),
  carta({ due_at: new Date(agora.getTime() + 30 * 86400000).toISOString() }), // fora da janela
  carta({ suspended: true }),                                // suspensa não conta
  carta({ state: "NEW", stability: null }),
  carta({ state: "REVIEW", stability: 40 }),
];
const prev = previsao(cartas, { agora });
conferir(prev.length === 7 && prev[0].total === 4 && prev[2].total === 1, "atrasadas e as de hoje contam em \"hoje\"; suspensas e fora dos 7 dias não contam");
conferir(etapa({ state: "NEW" }) === "novas" && etapa({ state: "REVIEW", stability: 21 }) === "firmes" && etapa({ state: "REVIEW", stability: 20 }) === "aprendendo" && etapa({ state: "LEARNING", stability: 50 }) === "aprendendo", "etapas: nova, aprendendo, firme (21+ dias de estabilidade e em revisão)");
const dom = dominio([{ id: "d1", name: "Comida", target_language: "zh" }, { id: "d2", name: "Vazio" }], cartas);
conferir(dom.length === 1 && dom[0].novas === 1 && dom[0].firmes === 1 && dom[0].aprendendo === 4 && dom[0].total === 6, "domínio por baralho conta só cartas ativas; baralho vazio não aparece");

console.log("\n— Respostas e pontos fracos");
const r2 = [rev(0, "nao", "c1", "CLOZE_SENTENCE_TO_WORD"), rev(1, "nao", "c1", "CLOZE_SENTENCE_TO_WORD"), rev(2, "acho", "c1"),
  rev(0, "decorei", "c2"), rev(1, "decorei", "c2"), rev(0, "nao", "c3"), rev(40, "nao", "c4"), rev(40, "nao", "c4"), rev(1, "nao", "apagada"), rev(2, "nao", "apagada")];
const resp = respostas(r2, { agora });
conferir(resp.total === 8 && resp.pctNao === 63 && resp.pctDecorei === 25, "proporção dos últimos 30 dias (respostas de 40 dias atrás ficam fora)");
const palavras = ["c1", "c2", "c3", "c4"].map((id, i) => ({ concept: { id, deck_id: "d1", gloss: `g${i}` }, facets: [{ facet_type: "WORD", value: ["吃", "水", "茶", "书"][i], metadata: { pos: i % 2 ? "substantivo" : "verbo" } }, { facet_type: "MEANING", value: ["comer", "água", "chá", "livro"][i] }] }));
const fracos = pontosFracos(palavras, r2, { agora });
conferir(fracos.length === 1 && fracos[0].palavra === "吃" && fracos[0].dificeis === 2 && fracos[0].ponteMaisDificil === "CLOZE_SENTENCE_TO_WORD", "ponto fraco: 吃, com 2 \"Difícil\", sobretudo na lacuna");
conferir(!fracos.some((f) => ["c3", "c4", "apagada"].includes(f.concept_id)), "fica de fora: um \"Difícil\" só, revisões antigas e palavras que já foram apagadas");
const porPonte = dificilPor(r2, (r) => r.bridge_template_id, { agora });
conferir(porPonte.length === 1 && porPonte[0].grupo === "WORD_TO_MEANING", "taxa por tipo de carta só aparece com pelo menos 3 respostas");

console.log("\n— Tudo junto e o que vai para a IA");
const p = calcularProgresso({ decks: [{ id: "d1", name: "Comida", target_language: "zh" }], palavras, cartas, revisoes: r2, agora });
conferir(p.temDados && p.pontosFracos.length === 1 && p.porDia.length === 14, "calcularProgresso junta todas as métricas");
const ia = JSON.stringify(resumoParaIA(p, { idiomas: ["Mandarim"] }));
conferir(!ia.includes("c1") && !ia.includes("d1") && !ia.includes("uc-") && ia.includes("吃"), "o resumo para a IA leva palavras e números, mas nenhum ID");
conferir(!calcularProgresso({}).temDados, "sem baralhos nem revisões: a aba sabe que ainda não há dados");

console.log("\n— Análise com IA");
const traduzido = traduzirResumo(resumoParaIA(p));
conferir(JSON.stringify(traduzido).includes("Frase com lacuna → Palavra") && !JSON.stringify(traduzido).includes("CLOZE_SENTENCE_TO_WORD"), "a IA recebe os nomes dos tipos de carta em português, não os IDs internos");
const limpa = limparAnalise({ dados_suficientes: true, resumo: "  ok  ", padroes: ["a", "", "b", "c", "d"], sugestoes: "não é lista" });
conferir(limpa.resumo === "ok" && limpa.padroes.join() === "a,b,c" && limpa.sugestoes.length === 0, "a resposta é limpa: no máximo 3 itens por lista, sem vazios, formato garantido");
conferir(INSTRUCAO_SISTEMA.includes("Nunca invente"), "o prompt proíbe inventar o que não está nos números");
let pedido = null;
const iaFalsa = { models: { generateContent: async (args) => { pedido = args; return { text: JSON.stringify({ dados_suficientes: true, resumo: "Você erra mais na lacuna.", padroes: ["lacuna"], sugestoes: ["estude as difíceis"] }) }; } } };
const an = await analisarProgresso(iaFalsa, "simulado", resumoParaIA(p));
conferir(an.resumo === "Você erra mais na lacuna." && pedido.config.responseSchema.required.includes("sugestoes") && pedido.contents.includes("吃"), "a análise usa saída estruturada e recebe as palavras difíceis");

console.log("\n— Registro de revisões (dados)");
conferir(ESQUEMA.revisoes?.includes("concept_id") && TABELAS.revisoes?.indices.includes("deck_id"), "tabela revisoes existe no navegador e no servidor, com índices por baralho e por palavra");
const ida = paraLinha("revisoes", { id: "r1", deck_id: "d1", card_id: "uc1", concept_id: "c1", bridge_template_id: "WORD_TO_MEANING", rating: "nao", respondido_em: "2026-11-18T12:00:00.000Z", duracao_ms: 3200, estado_antes: "REVIEW" }, "ana");
const volta = paraRegistro("revisoes", { ...Object.fromEntries(ida.nomes.map((n, i) => [n, ida.valores[i]])), respondido_em: new Date("2026-11-18T12:00:00.000Z") });
conferir(volta.rating === "nao" && volta.respondido_em === "2026-11-18T12:00:00.000Z" && volta.duracao_ms === 3200 && !("extra" in volta), "a revisão vai e volta do Postgres com cada campo na sua coluna");

const repo = criarRepositorio(adaptadorMemoria()); await repo.iniciar();
const deck = await repo.criarBaralho({ name: "Teste", creation_mode: "words", target_language: "zh", level: "HSK 1" });
const boa = { lemma: "水", pinyin: "shuǐ", pos: "substantivo", meaning: "água", sentence: "我喝水。", target_in_sentence: "水", sentence_pinyin: "wǒ hē shuǐ.", sentence_translation: "Eu bebo água." };
const pal = (g, ajuste = {}) => montarPalavraEnriquecida({ id: g, gloss: g }, { ...boa, ...ajuste }, { deck_id: deck.id, language: "zh", origin: "user" });
await repo.adicionarPalavras(deck.id, [pal("água"), pal("chá", { lemma: "茶", target_in_sentence: "茶", sentence: "我喝茶。" })]);
const b = await repo.carregarBaralho(deck.id);
const [agua, cha] = b.palavras;
const cartaAgua = b.cartas.find((c) => c.concept_id === agua.concept.id);
for (let i = 0; i < 3; i++) await repo.registrarRevisao({ carta: cartaAgua, rating: "nao", duracao_ms: 1000, respondido_em: h(i) });
await repo.registrarRevisao({ carta: b.cartas.find((c) => c.concept_id === cha.concept.id), rating: "decorei", respondido_em: h(0) });
const dados = await repo.carregarProgresso();
conferir(dados.revisoes.length === 4 && dados.revisoes[0].deck_id === deck.id && dados.revisoes[0].estado_antes === "NEW" && dados.palavras.length === 2 && dados.palavras[0].facets.length === 5, "cada resposta vira uma revisão; carregarProgresso traz baralhos, palavras com facetas, cartas e revisões");
const prog = calcularProgresso({ ...dados, agora });
conferir(prog.pontosFracos[0]?.palavra === "水" && prog.sequencia.atual === 3, "com dados reais do repositório, a aba acha o ponto fraco (水) e a sequência (3 dias)");
const so = montarFila(b.cartas, { conceitos: [agua.concept.id], agora: new Date("2000-01-01") });
conferir(so.length === 7 && so.every((c) => c.concept_id === agua.concept.id), "\"Estudar só essas\": a sessão traz só as cartas dessas palavras, mesmo antes da data de revisão");
await repo.excluirPalavra(agua.concept.id);
const depois = await repo.carregarProgresso();
conferir(depois.revisoes.length === 1 && depois.revisoes[0].concept_id === cha.concept.id, "apagar a palavra apaga também o histórico dela");

console.log(falhas ? `\n${falhas} teste(s) falharam.` : "\nTodos os testes passaram.");
process.exit(falhas ? 1 : 0);
