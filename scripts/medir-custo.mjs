// MEDIÇÃO DE CUSTO: cria um baralho de verdade (sem salvar nada) e mede quanto cada etapa custaria
// no plano pago do Gemini. Usa os mesmos módulos do app, então o número é o do produto.
//
// Uso:
//   npm run medir:custo
//   npm run medir:custo -- "no restaurante" 10 zh "HSK 2"
//
// Etapas medidas: Módulo 1 (sugerir palavras), Módulo 2 (facetas de todas, sem o banco de palavras)
// e voz (a palavra e a frase da primeira palavra). Grava o resultado em prototipos/custo-AAAA-MM-DD.json.

import { GoogleGenAI } from "@google/genai";
import { mkdirSync, writeFileSync } from "node:fs";
import { gerarPalavras } from "../lib/v2/modulo1.js";
import { enriquecer } from "../lib/v2/modulo2.js";
import { usoDaResposta, custoDaChamada, somarCustos, formatarUsd, formatarBrl, PRECOS_CONSULTADOS_EM, COTACAO_USD_BRL } from "../lib/v2/custos.js";
import { idiomaV2, textoParaVoz } from "../lib/v2/idiomas.js";
import dicionario from "../lib/v2/dados/hsk.js";

const [tema = "frutas", qtd = "10", idioma = "zh", nivelArg] = process.argv.slice(2);
const cfg = idiomaV2(idioma);
const nivel = nivelArg || cfg.niveis[1] || cfg.niveis[0];
const chave = process.env.GEMINI_API_KEY;
if (!chave) { console.log("Falta GEMINI_API_KEY no .env.local"); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: chave });

const lista = (principal, reservas) => [principal, ...reservas.split(",")].map((m) => (m || "").trim()).filter((m, i, l) => m && l.indexOf(m) === i);
const M1 = lista(process.env.GEMINI_THEME_MODEL || "gemini-3.5-flash", `${process.env.GEMINI_TEXT_MODEL || "gemini-flash-lite-latest"},${process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite"}`);
const M2 = lista(process.env.GEMINI_TEXT_MODEL || "gemini-flash-lite-latest", process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite,gemini-3.5-flash");
const VOZ = lista(process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts", process.env.GEMINI_TTS_FALLBACK || "gemini-2.5-flash-preview-tts,gemini-3.1-flash-tts-preview");

// Tenta os modelos em ordem, como as rotas do app
async function comReserva(modelos, rodar) {
  let ultimo;
  for (const modelo of modelos) {
    try { return { modelo, ...(await rodar(modelo)) }; }
    catch (e) { ultimo = e; console.log(`  ${modelo} falhou (${e?.status ?? ""} ${String(e?.message).slice(0, 80)}), tentando o próximo…`); }
  }
  throw ultimo;
}

console.log(`Baralho de teste: "${tema}", ${qtd} palavras, ${cfg.nome} ${nivel}\n`);

// 1. Módulo 1
const t1 = Date.now();
const m1 = await comReserva(M1, (modelo) => gerarPalavras(ai, modelo, { theme: tema, level: nivel, count: Number(qtd), target_language: cfg.codigo }, { dicionario: cfg.codigo === "zh" ? dicionario : null }));
if (!m1.wordList) { console.log("O tema foi recusado:", m1.refinar); process.exit(1); }
const palavras = m1.wordList.words.filter((w) => w.lemma);
console.log(`Módulo 1 (${m1.custo.modelo}): ${palavras.length} palavras em ${((Date.now() - t1) / 1000).toFixed(1)} s`);

// 2. Módulo 2 (todas as palavras vão para a IA: é o pior caso, sem o banco de palavras)
const t2 = Date.now();
const m2 = await comReserva(M2, (modelo) => enriquecer(ai, modelo, { ...m1.wordList, words: palavras }));
const custoM2 = somarCustos(m2.chamadas);
const boas = m2.resultados.filter((r) => r.facets?.length);
console.log(`Módulo 2 (${m2.chamadas[0]?.modelo}): ${boas.length} palavras em ${m2.chamadas.length} chamada(s), ${((Date.now() - t2) / 1000).toFixed(1)} s`);

// 3. Voz: palavra e frase da primeira palavra
const primeira = boas[0];
const word = primeira.facets.find((f) => f.facet_type === "WORD");
const frase = primeira.facets.find((f) => f.facet_type === "SENTENCE");
const vozes = [];
for (const [rotulo, texto] of [["palavra", textoParaVoz(word.value, word.metadata, cfg)], ["frase", frase.value]]) {
  const r = await comReserva(VOZ, async (modelo) => {
    const resp = await ai.models.generateContent({
      model: modelo, contents: texto,
      config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }, httpOptions: { timeout: 30_000 } },
    });
    if (!resp.candidates?.[0]?.content?.parts?.some((p) => p.inlineData)) throw new Error("sem áudio");
    return { custo: custoDaChamada(usoDaResposta(resp, modelo)) };
  });
  vozes.push({ rotulo, texto, ...r.custo });
  console.log(`Voz da ${rotulo} (${r.custo.modelo}): ${r.custo.tokens} tokens`);
}

// 4. Contas por unidade
const porPalavraIA = custoM2.usd / boas.length;
const porGravacao = somarCustos(vozes).usd / vozes.length;
const criar = m1.custo.usd + custoM2.usd;
const completo = criar + boas.length * 2 * porGravacao;
const resultado = {
  medido_em: new Date().toISOString(), precos_de: PRECOS_CONSULTADOS_EM, cotacao_usd_brl: COTACAO_USD_BRL,
  baralho: { tema, idioma: cfg.codigo, nivel, palavras: boas.length },
  modulo1: m1.custo, modulo2: { ...custoM2, chamadas: m2.chamadas }, voz: vozes,
  por_unidade: { palavra_ia_usd: porPalavraIA, gravacao_usd: porGravacao, criar_baralho_usd: criar, baralho_completo_usd: completo, mil_baralhos_completos_usd: completo * 1000 },
};

const l = (rotulo, usd, extra = "") => console.log(`${rotulo.padEnd(34)} ${formatarUsd(usd).padStart(14)} ${formatarBrl(usd).padStart(12)}  ${extra}`);
console.log("\nCusto no plano pago (sem o banco de palavras, que zera o Módulo 2 das palavras repetidas):");
l("Módulo 1: sugerir as palavras", m1.custo.usd, `${m1.custo.tokens} tokens${m1.custo.estimado ? " (preço estimado)" : ""}`);
l("Módulo 2: facetas de todas", custoM2.usd, `${custoM2.tokens} tokens${custoM2.estimado ? " (preço estimado)" : ""}`);
l("  por palavra", porPalavraIA);
l("Uma gravação de áudio", porGravacao, vozes.some((v) => v.estimado) ? "(preço estimado)" : "");
l("Criar o baralho (M1 + M2)", criar);
l(`Baralho completo (+ ${boas.length * 2} gravações)`, completo);
l("1.000 baralhos completos", completo * 1000);

mkdirSync("prototipos", { recursive: true });
const arquivo = `prototipos/custo-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(arquivo, JSON.stringify(resultado, null, 2));
console.log(`\nDetalhes em ${arquivo}`);
