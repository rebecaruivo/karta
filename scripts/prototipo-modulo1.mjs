// PROTÓTIPO DO MÓDULO 1 (v2): testa a geração de palavras com temas bons e ruins.
// Uso:
//   npm run prototipo:modulo1
//   npm run prototipo:modulo1 -- "no restaurante" HSK2 8
// Imprime, para cada tema: se a IA aceitou, a sugestão de refinamento, as palavras e o que foi descartado.

import { GoogleGenAI } from "@google/genai";
import { gerarPalavras } from "../lib/v2/modulo1.js";
import dicionario from "../lib/v2/dados/hsk.js";
if (!dicionario) console.log("(Lista do HSK ainda não baixada: rode npm run baixar:hsk para ligar a checagem.)");

if (!process.env.GEMINI_API_KEY) { console.log("Falta GEMINI_API_KEY no .env.local"); process.exit(1); }
// Mesmo modelo da rota do Módulo 1 (pode trocar para comparar: GEMINI_THEME_MODEL=gemini-flash-lite-latest npm run prototipo:modulo1)
const modelo = (process.env.GEMINI_THEME_MODEL || "gemini-3.5-flash").trim();
console.log(`Modelo: ${modelo}`);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Temas padrão: dois bons, um amplo demais e um sem sentido
const casos = process.argv[2]
  ? [{ theme: process.argv[2], level: (process.argv[3] || "HSK 1").replace(/^HSK\s*/i, "HSK "), count: Number(process.argv[4]) || 10 }]
  : [
      { theme: "frutas", level: "HSK 1", count: 8 },
      { theme: "comida", level: "HSK 1", count: 8 }, // tema amplo do dia a dia: deve ser aceito (prompt v3)
      { theme: "no restaurante", level: "HSK 2", count: 8 },
      { theme: "coisas", level: "HSK 1", count: 8 },
      { theme: "asdfgh", level: "HSK 1", count: 8 },
      { theme: "frutas", level: "HSK 1", count: 5, existing_words: ["苹果", "香蕉"] }, // "gerar mais"
    ];

for (const c of casos) {
  const inicio = Date.now();
  try {
    const r = await gerarPalavras(ai, modelo, c, { dicionario });
    const seg = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(`\n■ "${c.theme}" · ${c.level} · pediu ${c.count}${c.existing_words ? ` · já tem ${c.existing_words.join(" ")}` : ""} · ${seg}s`);
    if (r.refinar) { console.log(`  recusado → sugestões: ${r.refinar.join(" · ")}`); continue; }
    console.log("  " + r.wordList.words.map((w) => w.lemma_descartado ? `[${w.lemma_descartado} fora do HSK → retraduzir] ${w.gloss}` : `${w.lemma} ${w.gloss}${w.acima_do_nivel ? ` (HSK ${w.hsk})` : ""}`).join(" · "));
    if (r.descartadas.length) console.log("  descartadas: " + r.descartadas.map((d) => `${d.lemma} (${d.motivo})`).join(", "));
  } catch (e) {
    console.log(`\n■ "${c.theme}" falhou: ${e.status || ""} ${e.message}`);
  }
}
