// Testes automáticos das partes da v2 que não dependem da IA.
// Uso: npm run testar:v2
import { lerPalavras } from "../lib/v2/portaEntrada.js";
import { montarCartas, CATALOGO_PONTES } from "../lib/v2/pontes.js";
import { montarFilaDoDia } from "../lib/v2/sessao.js";
import { calcularLacuna, fraseComLacuna, validarMandarim, montarPalavraEnriquecida, capitalizarPinyin, alertas } from "../lib/v2/facetas.js";

let falhas = 0;
const conferir = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) falhas++; };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("— Porta de entrada");
const r1 = lerPalavras("água, Arroz,arroz ;  casa\nbanco (dinheiro),, ", { target_language: "zh", level: "HSK 1" });
conferir(igual(r1.wordList.words.map((w) => w.gloss), ["água", "Arroz", "casa", "banco"]), "separa por vírgula, ponto e vírgula e linha; tira vazios e repetidas");
conferir(r1.wordList.words[3].sense_hint === "dinheiro", "lê a dica de sentido entre parênteses");
conferir(r1.avisos.some((a) => a.includes("repetida")), "avisa sobre a palavra repetida");
conferir(r1.wordList.origin === "user", "marca origin = user");
conferir(Boolean(lerPalavras(" , ;", { target_language: "zh", level: "HSK 1" }).erro), "lista vazia dá erro");
conferir(lerPalavras(Array.from({ length: 60 }, (_, i) => `p${i}`).join(","), {}).wordList.words.length === 50, "corta em 50 palavras");

console.log("\n— Lacuna (a função é a mesma para todos os idiomas; cada caso testa uma situação)");
conferir(igual(calcularLacuna("我喝水。", "水").indices, [2, 3]), "mandarim · substantivo: 我喝水。 com alvo 水 -> [2, 3) (início incluído, fim excluído)");
conferir(fraseComLacuna("我喝水。", [2, 3]) === "我喝＿＿。", "mandarim · monta a frase com lacuna: 我喝＿＿。");
conferir(igual(calcularLacuna("水を飲みます。", "飲みます").indices, [2, 6]), "japonês · verbo conjugado: acha 飲みます na frase, embora o lema seja 飲む (o mandarim não conjuga, por isso o caso é em japonês)");
conferir(Boolean(calcularLacuna("水水很好。", "水").erro), "mandarim · alvo repetido na frase (水水) é recusado");
conferir(Boolean(calcularLacuna("我喝茶。", "水").erro), "mandarim · alvo que não está na frase é recusado");
conferir(igual(calcularLacuna("Je mange une pomme.", "mange").indices, [3, 8]), "francês · verbo conjugado em alfabeto latino: acha mange (lema: manger)");

console.log("\n— Validação do perfil mandarim");
const boa = { lemma: "水", pinyin: "shuǐ", pos: "substantivo", meaning: "água", sentence: "我喝水。", target_in_sentence: "水", sentence_pinyin: "Wǒ hē shuǐ.", sentence_translation: "Eu bebo água." };
conferir(validarMandarim(boa).length === 0, "carta boa passa sem problemas");
conferir(validarMandarim({ ...boa, pinyin: "shui3" }).some((p) => p.includes("número de tom")), "pega pinyin com número de tom");
conferir(validarMandarim({ ...boa, lemma: "agua" }).some((p) => p.includes("hanzi")), "pega escrita que não é hanzi");

console.log("\n— Facetas derivadas e alertas (prompt v2)");
conferir(capitalizarPinyin("wǒ xiǎng hē shuǐ.") === "Wǒ xiǎng hē shuǐ.", "mandarim · pinyin da frase com maiúscula, inclusive em letra com tom (wǒ -> Wǒ)");
conferir(alertas({ ambiguous: true, other_senses: "assento: 长椅", level_fit: true, note: "" })[0] === "ambígua: também pode ser assento: 长椅", "palavra ambígua vira alerta com os outros sentidos");
conferir(alertas({ ambiguous: false, other_senses: "", level_fit: false, note: "" })[0] === "acima do nível pedido", "palavra acima do nível vira alerta");
conferir(alertas({ ambiguous: false, other_senses: "", level_fit: true, note: "" }).length === 0, "palavra sem ressalvas não gera alerta");

console.log("\n— Palavra enriquecida (formato do documento)");
const pe = montarPalavraEnriquecida({ id: "w1", gloss: "água", sense_hint: null }, boa, { deck_id: "d1", language: "zh", origin: "user" });
conferir(igual(pe.facets.map((f) => f.facet_type), ["WORD", "MEANING", "SENTENCE", "AUDIO", "AUDIO"]), "5 facetas: WORD, MEANING, SENTENCE e 2 AUDIO");
conferir(igual(pe.facets[2].metadata.cloze_indices, [2, 3]), "SENTENCE traz cloze_indices calculado pelo código");
conferir(pe.facets[3].parent_facet_id === pe.facets[0].id && pe.facets[4].parent_facet_id === pe.facets[2].id, "áudios apontam para a escrita e para a frase (parent_facet_id)");
conferir(pe.facets.filter((f) => f.facet_type === "AUDIO").every((f) => f.status === "pending"), "áudios nascem pending");
conferir(!("audio_slow_url" in pe.facets[3].metadata), "sem audio_slow_url: a versão lenta é tocada no navegador");


console.log("\n— Módulo 3: montagem de pontes");
const base = (gloss, ajuste = {}) => montarPalavraEnriquecida({ id: gloss, gloss, sense_hint: null }, { ...boa, ...ajuste }, { deck_id: "d1", language: "zh", origin: "user" });
const agua = base("água");
const { cartas: c1, naoCriadas: n1 } = montarCartas([agua]);
conferir(c1.length === 7 && n1.length === 0, "palavra completa gera 7 cartas (uma por ponte do catálogo)");
conferir(c1.every((c) => c.state === "NEW" && c.stability === null && !("user_id" in c)), "cartas nascem NEW, sem estado de memória e sem user_id");
const pontesDeAudio = CATALOGO_PONTES.filter((p) => [...p.front_facet_types, ...p.back_facet_types].includes("AUDIO")).map((p) => p.id);
conferir(pontesDeAudio.length === 4 && pontesDeAudio.every((id) => c1.some((c) => c.bridge_template_id === id)), "áudio pendente não impede as 4 pontes de áudio (a carta usa a voz do navegador)");
const semLacuna = base("chá", { target_in_sentence: "咖啡" });
const { cartas: c2, naoCriadas: n2 } = montarCartas([semLacuna]);
conferir(c2.length === 6 && n2[0]?.ponte === "CLOZE_SENTENCE_TO_WORD" && n2[0].motivo === "frase sem lacuna válida", "sem lacuna válida: 6 cartas, e o motivo da que faltou fica registrado");
const semTraducao = base("sol", { sentence_translation: "" });
conferir(montarCartas([semTraducao]).naoCriadas.some((n) => n.ponte === "MEANING_TO_SENTENCE" && n.motivo === "frase sem tradução"), "sem tradução da frase: a ponte Significado → Frase não é criada");
const falhou = base("céu"); falhou.facets[0].status = "failed";
conferir(montarCartas([falhou]).cartas.every((c) => !["AUDIO_TO_WORD", "WORD_TO_AUDIO", "WORD_TO_MEANING", "AUDIO_TO_MEANING", "CLOZE_SENTENCE_TO_WORD"].includes(c.bridge_template_id)), "escrita com falha: nenhuma ponte que mostra a escrita é criada");
const soAtivas = CATALOGO_PONTES.map((p) => ({ ...p, active: p.id === "WORD_TO_MEANING" }));
conferir(montarCartas([agua], { catalogo: soAtivas }).cartas.length === 1, "ponte desativada não gera carta");
conferir(montarCartas([agua], { existentes: c1 }).cartas.length === 0, "rodar de novo não duplica (conceito + ponte é único)");

console.log("\n— Fila do dia e cartas irmãs");
const agora = new Date("2026-11-15T15:00:00");
const tres = ["água", "chá", "sol"].map((g) => base(g + "!"));
const todas = montarCartas(tres, { agora }).cartas;
const { fila: f1, enterradas: e1 } = montarFilaDoDia(todas, { agora });
conferir(todas.length === 21 && f1.length === 3 && e1.length === 18, "3 palavras × 7 cartas: só 3 aparecem hoje (uma por palavra); 18 irmãs ficam para outro dia");
conferir(f1.every((c) => c.bridge_template_id === "WORD_TO_MEANING"), "a primeira carta de cada palavra é a mais fácil (Palavra → Significado)");
conferir(montarFilaDoDia(todas, { agora, limiteNovas: 2 }).fila.length === 2, "respeita o limite de cartas novas por dia");
const estudada = todas.map((c, i) => (i === 0 ? { ...c, state: "REVIEW", last_review_at: "2026-11-15T09:00:00", due_at: "2026-11-15T10:00:00" } : c));
const { fila: f2 } = montarFilaDoDia(estudada, { agora });
conferir(!f2.some((c) => c.concept_id === todas[0].concept_id), "palavra que já teve carta estudada hoje não volta hoje");
const revisao = todas.map((c, i) => (i === 3 ? { ...c, state: "REVIEW", last_review_at: "2026-11-10T09:00:00", due_at: "2026-11-14T10:00:00" } : c));
const { fila: f3 } = montarFilaDoDia(revisao, { agora });
conferir(f3[0].id === todas[3].id, "revisão atrasada vem antes das cartas novas");

console.log(falhas ? `\n${falhas} teste(s) falharam.` : "\nTodos os testes passaram.");
process.exit(falhas ? 1 : 0);
