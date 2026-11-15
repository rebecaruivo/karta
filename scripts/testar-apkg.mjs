// Teste automático da exportação .apkg (roda no Node, sem navegador).
// Uso: npm run testar:apkg
// Monta um baralho de exemplo, gera o .apkg, abre de volta e confere o conteúdo.

import initSqlJs from "sql.js";
import JSZip from "jszip";
import { writeFileSync } from "node:fs";
import { montarApkg, TIPOS_DE_CARTAO } from "../lib/apkg.js";
import { pcmParaWav } from "../lib/wav.js";

const SQL = await initSqlJs();
let falhas = 0;
const conferir = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) falhas++; };

// Um "bip" de 0,3 s no lugar de um áudio de verdade
const pcm = Buffer.alloc(24000 * 0.3 * 2);
for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(6000 * Math.sin(i / 8)), i * 2);
const wav = new Uint8Array(pcmParaWav(pcm));

const baralho = {
  id: "teste-123", idioma: "mandarim", nivel: "HSK 2", tema: "Comida", modelo: "teste",
  cartas: [
    { id: "a", palavra: "鱼", leitura: "yú", traducao: "peixe", classe: "substantivo", exemplo: "我最喜欢吃鱼。", exemploLeitura: "Wǒ zuì xǐhuan chī yú.", exemploTraducao: "O que eu mais gosto de comer é peixe." },
    { id: "b", palavra: "牛奶", leitura: "niúnǎi", traducao: "leite", classe: "substantivo", exemplo: "早上我喝了一杯牛奶。", exemploLeitura: "Zǎoshang wǒ hē le yì bēi niúnǎi.", exemploTraducao: "De manhã tomei um copo de leite." },
    { id: "c", palavra: "<茶>", leitura: "chá", traducao: "chá & café", classe: "substantivo", exemplo: "我喝茶。", exemploLeitura: "Wǒ hē chá.", exemploTraducao: "Eu bebo chá." },
  ],
};
// Cartas "a" e "b" têm áudio; "c" não tem (não deve gerar cartão de audição)
const obterAudio = async (cartaId) => (cartaId === "c" ? null : wav);

const { bytes, resumo, nomeBaralho } = await montarApkg({ SQL, JSZip, baralho, idioma: { nome: "Mandarim" }, obterAudio });
writeFileSync("amostra.apkg", bytes);
console.log(`Gerado amostra.apkg (${bytes.length} bytes) · ${JSON.stringify(resumo)}\n`);

// Abre o arquivo de volta e confere
const zip = await JSZip.loadAsync(bytes);
const nomes = Object.keys(zip.files);
conferir(nomes.includes("collection.anki2") && nomes.includes("media"), "ZIP tem collection.anki2 e media");
const midia = JSON.parse(await zip.file("media").async("string"));
conferir(Object.keys(midia).length === 4, `4 áudios no mapa de mídia (encontrei ${Object.keys(midia).length})`);
conferir(Object.keys(midia).every((k) => nomes.includes(k)), "cada áudio do mapa existe no ZIP");

const db = new SQL.Database(await zip.file("collection.anki2").async("uint8array"));
const um = (sql) => db.exec(sql)[0]?.values ?? [];
conferir(um("select count(*) from notes")[0][0] === 3, "3 notas (uma por palavra)");
const porOrd = Object.fromEntries(um("select ord, count(*) from cards group by ord"));
conferir(porOrd[0] === 3 && porOrd[1] === 2 && porOrd[2] === 3, `cartões por tipo: leitura ${porOrd[0]}, audição ${porOrd[1]}, produção ${porOrd[2]} (esperado 3, 2, 3)`);

const [models, decks] = um("select models, decks from col")[0].map((t) => JSON.parse(t));
const modelo = Object.values(models)[0];
conferir(modelo.tmpls.length === TIPOS_DE_CARTAO.length, `modelo com ${modelo.tmpls.length} tipos de cartão`);
conferir(Object.values(decks).some((d) => d.name === nomeBaralho), `baralho "${nomeBaralho}" criado`);

const [flds] = um("select flds from notes where guid = 'karta-c'")[0];
conferir(flds.includes("&lt;茶&gt;") && flds.includes("chá &amp; café"), "caracteres especiais escapados (<, >, &)");
const [fldsA] = um("select flds from notes where guid = 'karta-a'")[0];
conferir(fldsA.split("\x1f").length === modelo.flds.length && fldsA.includes("[sound:karta_a_palavra.wav]"), "campos da nota na ordem certa, com [sound:]");

const somMidia = await zip.file(Object.keys(midia).find((k) => midia[k] === "karta_a_palavra.wav")).async("uint8array");
conferir(Buffer.from(somMidia.subarray(0, 4)).toString() === "RIFF", "áudio dentro do ZIP é um WAV válido");

// ── v2: cartas por conexão ──────────────────────────────────────
console.log("\n— v2 (cartas por conexão)");
const { montarApkgV2, TIPOS_V2 } = await import("../lib/v2/apkg.js");
const { montarPalavraEnriquecida } = await import("../lib/v2/facetas.js");
const { montarCartas } = await import("../lib/v2/pontes.js");

const ia = (lemma, pinyin, meaning, sentence, alvo, sentence_pinyin, sentence_translation) =>
  ({ lemma, pinyin, pos: "substantivo", meaning, sentence, target_in_sentence: alvo, sentence_pinyin, sentence_translation, level_fit: true });
const palavrasV2 = [
  montarPalavraEnriquecida({ id: "w1", gloss: "água" }, ia("水", "shuǐ", "água", "我想喝水。", "水", "wǒ xiǎng hē shuǐ.", "Eu quero beber água."), { deck_id: "d", language: "zh", origin: "user" }),
  montarPalavraEnriquecida({ id: "w2", gloss: "chá" }, ia("茶", "chá", "chá & <infusão>", "这是我的茶。", "茶", "zhè shì wǒ de chá.", "Este é o meu chá."), { deck_id: "d", language: "zh", origin: "user" }),
];
const { cartas: cartasV2 } = montarCartas(palavrasV2);
cartasV2.find((c) => c.concept_id === palavrasV2[1].concept.id && c.bridge_template_id === "WORD_TO_MEANING").suspended = true;
// Só o áudio da palavra "água" foi gravado
const audioAgua = palavrasV2[0].facets.find((f) => f.facet_type === "AUDIO" && f.parent_facet_id === palavrasV2[0].facets[0].id);
audioAgua.status = "ready";
const deckV2 = { id: "deck-v2", name: "Bebidas", level: "HSK 1", facetas_opcionais: ["AUDIO"], modelo: "teste" };

const v2 = await montarApkgV2({ SQL, JSZip, deck: deckV2, palavras: palavrasV2, cartas: cartasV2, obterAudio: async (id) => (id === audioAgua.id ? wav : null) });
writeFileSync("amostra-v2.apkg", v2.bytes);
console.log(`Gerado amostra-v2.apkg (${v2.bytes.length} bytes) · ${JSON.stringify(v2.resumo)}`);
const zipV2 = await JSZip.loadAsync(v2.bytes);
const dbV2 = new SQL.Database(await zipV2.file("collection.anki2").async("uint8array"));
const q = (sql) => dbV2.exec(sql)[0]?.values ?? [];
const [modelsV2] = q("select models from col")[0].map((t) => JSON.parse(t));
const modeloV2 = Object.values(modelsV2)[0];
conferir(modeloV2.tmpls.length === 7 && modeloV2.id !== modelo.id, "modelo próprio da v2, com 7 tipos de cartão (um por ponte), separado do modelo da v1");
conferir(q("select count(*) from notes")[0][0] === 2 && q("select count(*) from cards")[0][0] === 13, "uma nota por palavra e um cartão por carta do Karta (14 cartas − 1 suspensa = 13)");
conferir(TIPOS_V2[0].ponte === "WORD_TO_MEANING" && TIPOS_V2[6].ponte === "MEANING_TO_SENTENCE", "tipos de cartão na ordem de apresentação do catálogo (fácil → difícil)");
const midiaV2 = JSON.parse(await zipV2.file("media").async("string"));
conferir(Object.keys(midiaV2).length === 1 && v2.resumo.semGravacao === 3, "só a gravação pronta vai no pacote (1); as outras 3 ficam com a voz do sistema do Anki");
conferir(modeloV2.tmpls.some((t) => t.qfmt.includes("{{tts zh_CN:Palavra}}")), "sem gravação, o cartão de áudio usa {{tts}} do Anki (equivalente à voz do navegador)");
const [fAgua] = q(`select flds from notes where guid = 'karta-v2-${palavrasV2[0].concept.id}'`)[0];
const camposAgua = fAgua.split("\x1f");
conferir(camposAgua[6].includes('<span class="lacuna"></span>') && camposAgua[5].includes('<span class="destaque">水</span>'), "frase com lacuna e com destaque montadas pelas posições calculadas no código");
conferir(camposAgua[9].startsWith("[sound:") && camposAgua[11] === "1", "áudio gravado entra como [sound:] e o baralho marca que tem exercícios de áudio");
const [fCha] = q(`select flds from notes where guid = 'karta-v2-${palavrasV2[1].concept.id}'`)[0];
conferir(fCha.includes("chá &amp; &lt;infusão&gt;"), "v2 também escapa <, > e &");

const semAudio = montarCartas(palavrasV2, { facetasOpcionais: [] }).cartas;
const v2s = await montarApkgV2({ SQL, JSZip, deck: { ...deckV2, id: "sem", facetas_opcionais: [] }, palavras: palavrasV2, cartas: semAudio, obterAudio: async () => wav });
const dbS = new SQL.Database(await (await JSZip.loadAsync(v2s.bytes)).file("collection.anki2").async("uint8array"));
const fldsS = dbS.exec("select flds from notes")[0].values.map(([f]) => f.split("\x1f"));
conferir(dbS.exec("select count(*) from cards")[0].values[0][0] === 6 && fldsS.every((f) => f[11] === "" && f[9] === ""), "baralho sem áudio: 3 cartões por palavra, sem gravações e sem o botão \"Ouvir frase\"");

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTudo certo. Para conferir de verdade, importe amostra.apkg e amostra-v2.apkg no Anki.");
process.exit(falhas ? 1 : 0);
