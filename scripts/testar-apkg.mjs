// Teste automático da exportação .apkg da v2 (roda no Node, sem navegador).
// Uso: npm run testar:apkg
// Monta baralhos de exemplo, gera o .apkg, abre de volta e confere o conteúdo.

import initSqlJs from "sql.js";
import JSZip from "jszip";
import { writeFileSync } from "node:fs";
import { pcmParaWav } from "../lib/wav.js";
import { montarApkgV2, TIPOS_V2 } from "../lib/v2/apkg.js";
import { montarPalavraEnriquecida } from "../lib/v2/facetas.js";
import { montarCartas } from "../lib/v2/pontes.js";

const SQL = await initSqlJs();
let falhas = 0;
const conferir = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) falhas++; };

// Um "bip" de 0,3 s no lugar de um áudio de verdade
const pcm = Buffer.alloc(24000 * 0.3 * 2);
for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(6000 * Math.sin(i / 8)), i * 2);
const wav = new Uint8Array(pcmParaWav(pcm));

const ia = ({ lemma, leitura, meaning, sentence, alvo, fraseLeitura, traducao }) => ({
  lemma, leitura, pos: "substantivo", meaning, sentence, target_in_sentence: alvo,
  frase_leitura: fraseLeitura, sentence_translation: traducao, ambiguous: false, other_senses: "", level_fit: true, note: "",
});
const palavra = (gloss, dados, language) => montarPalavraEnriquecida({ id: gloss, gloss }, dados, { deck_id: "d", language, origin: "user" });

console.log("— v2 (cartas por conexão)");
const agua = palavra("água", ia({ lemma: "水", leitura: "shuǐ", meaning: "água", sentence: "我想喝水。", alvo: "水", fraseLeitura: "wǒ xiǎng hē shuǐ.", traducao: "Eu quero beber água." }), "zh");
const cha = palavra("chá", ia({ lemma: "茶", leitura: "chá", meaning: "chá & <infusão>", sentence: "这是我的茶。", alvo: "茶", fraseLeitura: "zhè shì wǒ de chá.", traducao: "Este é o meu chá." }), "zh");
const { cartas } = montarCartas([agua, cha]);
cartas.find((c) => c.concept_id === cha.concept.id && c.bridge_template_id === "WORD_TO_MEANING").suspended = true;
const audioAgua = agua.facets.find((f) => f.facet_type === "AUDIO" && f.parent_facet_id === agua.facets[0].id);
audioAgua.status = "ready";
const deck = { id: "deck-zh", name: "Bebidas", level: "HSK 1", target_language: "zh", facetas_opcionais: ["AUDIO"], modelo: "teste" };
const v2 = await montarApkgV2({ SQL, JSZip, deck, palavras: [agua, cha], cartas, obterAudio: async (id) => (id === audioAgua.id ? wav : null) });
writeFileSync("amostra-v2.apkg", v2.bytes);
console.log(`Gerado amostra-v2.apkg (${v2.bytes.length} bytes) · ${JSON.stringify(v2.resumo)}`);

const zip = await JSZip.loadAsync(v2.bytes);
const db = new SQL.Database(await zip.file("collection.anki2").async("uint8array"));
const q = (sql) => db.exec(sql)[0]?.values ?? [];
const [models] = q("select models from col")[0].map((t) => JSON.parse(t));
const modelo = Object.values(models)[0];
conferir(zip.file("collection.anki2") && zip.file("media"), "ZIP tem collection.anki2 e media");
conferir(modelo.tmpls.length === 7 && TIPOS_V2[0].ponte === "WORD_TO_MEANING" && TIPOS_V2[6].ponte === "MEANING_TO_SENTENCE", "modelo com os 7 tipos de cartão, na ordem do catálogo");
conferir(q("select count(*) from notes")[0][0] === 2 && q("select count(*) from cards")[0][0] === 13, "uma nota por palavra e um cartão por carta ativa (14 − 1 suspensa = 13)");
const midia = JSON.parse(await zip.file("media").async("string"));
conferir(Object.keys(midia).length === 1 && v2.resumo.semGravacao === 3, "só a gravação pronta vai no pacote; as outras 3 usam a voz do sistema");
conferir(modelo.tmpls.some((t) => t.qfmt.includes("{{tts zh_CN:Palavra}}")), "sem gravação, o cartão usa {{tts}} do Anki");
const [fAgua] = q(`select flds from notes where guid = 'karta-v2-${agua.concept.id}'`)[0];
const camposAgua = fAgua.split("\x1f");
conferir(camposAgua[6].includes('<span class="lacuna"></span>') && camposAgua[5].includes('<span class="destaque">水</span>'), "frase com lacuna e com destaque calculadas pelo código");
conferir(camposAgua[9].startsWith("[sound:") && camposAgua[11] === "1", "áudio gravado entra como [sound:] e o baralho marca que tem áudio");
const [fCha] = q(`select flds from notes where guid = 'karta-v2-${cha.concept.id}'`)[0];
conferir(fCha.includes("chá &amp; &lt;infusão&gt;"), "caracteres especiais são escapados (<, >, &)");
conferir(v2.nomeBaralho === "Karta::Mandarim::Bebidas (HSK 1)", "nome do baralho no Anki");

const semAudio = montarCartas([agua, cha], { facetasOpcionais: ["SENTENCE"] }).cartas;
const v2s = await montarApkgV2({ SQL, JSZip, deck: { ...deck, id: "sem", facetas_opcionais: [] }, palavras: [agua, cha], cartas: semAudio, obterAudio: async () => wav });
const dbS = new SQL.Database(await (await JSZip.loadAsync(v2s.bytes)).file("collection.anki2").async("uint8array"));
const fldsS = dbS.exec("select flds from notes")[0].values.map(([f]) => f.split("\x1f"));
conferir(dbS.exec("select count(*) from cards")[0].values[0][0] === 6 && fldsS.every((f) => f[11] === "" && f[9] === ""), "baralho sem áudio: 3 cartões por palavra, sem gravações");

console.log("\n— Leitura escrita só onde há escrita própria (pinyin e kana; sem IPA no francês)");
const fr = palavra("maçã", ia({ lemma: "pomme", leitura: "/pɔm/", meaning: "maçã", sentence: "Je mange la pomme.", alvo: "pomme", fraseLeitura: "/ʒə mɑ̃ʒ la pɔm/", traducao: "Eu como a maçã." }), "fr");
const apkgFr = await montarApkgV2({ SQL, JSZip, deck: { id: "deck-fr", name: "Frutas", level: "A1", target_language: "fr", facetas_opcionais: ["AUDIO"] }, palavras: [fr], cartas: montarCartas([fr]).cartas, obterAudio: async () => null });
const dbFr = new SQL.Database(await (await JSZip.loadAsync(apkgFr.bytes)).file("collection.anki2").async("uint8array"));
const [modelosFr] = dbFr.exec("select models from col")[0].values.map(([t]) => JSON.parse(t));
const modeloFr = Object.values(modelosFr)[0];
conferir(!modeloFr.flds.some((f) => f.name === "Leitura" || f.name === "FraseLeitura"), "francês · modelo sem campos de leitura (nada de IPA no Anki)");
const SEM_AUDIO_NO_VERSO = ["Palavra → Significado", "Áudio → Significado", "Áudio → Palavra", "Frase com lacuna → Palavra", "Significado → Frase"];
conferir(SEM_AUDIO_NO_VERSO.every((nome) => {
  const t = modeloFr.tmpls.find((x) => x.name.includes(nome));
  return t && !/ComAudio|Ouvir|\[sound:|\{\{tts/.test(t.afmt);
}), "francês · verso sem áudio nas 5 cartas corrigidas");
conferir(modeloFr.tmpls.some((t) => t.qfmt.includes("{{tts fr_FR:Palavra}}")), "francês · a voz do Anki usa fr_FR");
conferir(apkgFr.nomeBaralho === "Karta::Francês::Frutas (A1)", "francês · nome do baralho no Anki");

const ja = palavra("água", ia({ lemma: "水", leitura: "みず (mizu)", meaning: "água", sentence: "水を飲みます。", alvo: "水", fraseLeitura: "みずをのみます。", traducao: "Eu bebo água." }), "ja");
const apkgJa = await montarApkgV2({ SQL, JSZip, deck: { id: "deck-ja", name: "Bebidas", level: "N5", target_language: "ja", facetas_opcionais: ["AUDIO"] }, palavras: [ja], cartas: montarCartas([ja]).cartas, obterAudio: async () => null });
const dbJa = new SQL.Database(await (await JSZip.loadAsync(apkgJa.bytes)).file("collection.anki2").async("uint8array"));
const [modelosJa] = dbJa.exec("select models from col")[0].values.map(([t]) => JSON.parse(t));
const modeloJa = Object.values(modelosJa)[0];
conferir(modeloJa.flds.some((f) => f.name === "Leitura") && modeloJa.flds.some((f) => f.name === "FraseLeitura"), "japonês · modelo com os campos de leitura");
conferir(modeloJa.tmpls.some((t) => t.qfmt.includes("{{tts ja_JP:Palavra}}")), "japonês · a voz do Anki usa ja_JP");
conferir(apkgJa.nomeBaralho === "Karta::Japonês::Bebidas (N5)", "japonês · nome do baralho no Anki");

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTudo certo. Para conferir de verdade, importe amostra-v2.apkg no Anki.");
process.exit(falhas ? 1 : 0);
