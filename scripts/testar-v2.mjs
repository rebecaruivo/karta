// Testes automáticos das partes da v2 que não dependem da IA.
// Uso: npm run testar:v2
import { lerPalavras } from "../lib/v2/portaEntrada.js";
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

console.log(falhas ? `\n${falhas} teste(s) falharam.` : "\nTodos os testes passaram.");
process.exit(falhas ? 1 : 0);
