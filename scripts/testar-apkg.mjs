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

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTudo certo. Para conferir de verdade, importe amostra.apkg no Anki.");
process.exit(falhas ? 1 : 0);
