// PROTÓTIPO DO MÓDULO 2 (v2), perfil mandarim — passo 3 da seção 11 do documento.
// Mede qualidade e consumo do enriquecimento de facetas com um conjunto pequeno de palavras.
//
// Uso:
//   npm run prototipo:modulo2
//   npm run prototipo:modulo2 -- "água, banco (dinheiro), comer" HSK2
//
// Gera em prototipos/ um relatório .md (para revisar) e um .json (dados completos).

import { GoogleGenAI } from "@google/genai";
import { mkdirSync, writeFileSync } from "node:fs";
import { lerPalavras } from "../lib/v2/portaEntrada.js";
import { enriquecer, VERSAO_PROMPT } from "../lib/v2/modulo2.js";
import { fraseComLacuna } from "../lib/v2/facetas.js";
import { montarCartas } from "../lib/v2/pontes.js";
import { montarFila } from "../lib/v2/sessao.js";

// Lista padrão com casos difíceis de propósito
const PADRAO = "água, arroz, comer, bonito, ônibus, obrigado, banco, manga (fruta), pegar, saudade";
const texto = process.argv[2] || PADRAO;
const nivel = (process.argv[3] || "HSK 2").replace(/^HSK\s*/i, "HSK ");

if (!process.env.GEMINI_API_KEY) { console.log("Falta GEMINI_API_KEY no .env.local"); process.exit(1); }
const modelos = [process.env.GEMINI_TEXT_MODEL, ...(process.env.GEMINI_FALLBACK_MODEL || "").split(",")]
  .map((m) => (m || "").trim()).filter(Boolean);

// 1. Porta de entrada
const { wordList, avisos, erro } = lerPalavras(texto, { target_language: "zh", level: nivel });
if (erro) { console.log(erro); process.exit(1); }
avisos.forEach((a) => console.log("aviso:", a));
console.log(`${wordList.words.length} palavras · nível ${nivel}`);

// 2. Módulo 2, tentando os modelos em ordem se um estiver sobrecarregado
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
let saida = null, modeloUsado = null;
for (const modelo of modelos) {
  try {
    console.log(`Enriquecendo com ${modelo}…`);
    saida = await enriquecer(ai, modelo, wordList);
    modeloUsado = modelo;
    break;
  } catch (e) {
    console.log(`  falhou (status ${e?.status ?? "?"}): ${String(e?.message).slice(0, 120)}`);
  }
}
if (!saida) { console.log("Nenhum modelo respondeu. Rode npm run diagnostico."); process.exit(1); }

// 3. Módulo 3: cartas e fila de estudo
const { resultados, chamadas } = saida;
const { cartas, naoCriadas } = montarCartas(resultados.filter((r) => r.facets.length));
const fila = montarFila(cartas);

// 4. Métricas
const soma = (k) => chamadas.reduce((s, c) => s + (c[k] || 0), 0);
const comProblema = resultados.filter((r) => r.problemas.length);
const metricas = {
  modelo: modeloUsado,
  versaoPrompt: VERSAO_PROMPT,
  palavras: resultados.length,
  chamadas: chamadas.length,
  tempoTotalS: +(soma("ms") / 1000).toFixed(1),
  tokensEntrada: soma("tokensEntrada"),
  tokensSaida: soma("tokensSaida"),
  tokensPensamento: soma("tokensPensamento"),
  palavrasSemProblema: resultados.length - comProblema.length,
  lacunasValidas: resultados.filter((r) => r.facets[2]?.metadata?.cloze_indices).length,
  ambiguas: resultados.filter((r) => r.facets[1]?.metadata?.ambiguous).length,
  acimaDoNivel: resultados.filter((r) => r.facets[0]?.metadata?.level_fit === false).length,
  cartas: cartas.length,
  cartasNaoCriadas: naoCriadas.length,
  cartasParaEstudar: fila.length,
};

// 5. Relatório para revisão humana
const linhas = resultados.map((r) => {
  const [w, m, s] = r.facets;
  const lacuna = s?.metadata?.cloze_indices ? fraseComLacuna(s.value, s.metadata.cloze_indices) : "—";
  return `| ${r.concept.gloss}${r.concept.sense_hint ? ` (${r.concept.sense_hint})` : ""} | ${w?.value ?? "—"} | ${w?.metadata?.pinyin ?? ""} | ${w?.metadata?.pos ?? ""} | ${m?.value ?? ""} | ${s?.value ?? ""}<br>${s?.metadata?.pinyin ?? ""}<br>${s?.metadata?.translation ?? ""} | ${lacuna} | ${r.problemas.join("; ") || "ok"} | ${r.alertas.join("; ") || "—"} | |`;
});
const agora = new Date();
const carimbo = agora.toISOString().slice(0, 16).replace(/[:T]/g, "-");
const md = `# Protótipo do Módulo 2 · mandarim · ${agora.toLocaleString("pt-BR")}

| Métrica | Valor |
|---|---|
| Modelo | ${metricas.modelo} |
| Versão do prompt | ${metricas.versaoPrompt} |
| Palavras | ${metricas.palavras} (em ${metricas.chamadas} chamada${metricas.chamadas > 1 ? "s" : ""}) |
| Tempo total | ${metricas.tempoTotalS} s |
| Tokens de entrada / saída / raciocínio | ${metricas.tokensEntrada} / ${metricas.tokensSaida} / ${metricas.tokensPensamento} |
| Sem problema na checagem automática | ${metricas.palavrasSemProblema} de ${metricas.palavras} |
| Lacunas válidas | ${metricas.lacunasValidas} de ${metricas.palavras} |
| Marcadas como ambíguas | ${metricas.ambiguas} |
| Acima do nível | ${metricas.acimaDoNivel} |
| Cartas geradas (Módulo 3) | ${metricas.cartas} (${metricas.cartasNaoCriadas} não criadas) |
| Disponíveis para estudar | ${metricas.cartasParaEstudar} cartas |

## Revisão

A checagem automática pega erros de formato. A coluna **Revisão humana** é para você: marque ✓ ou descreva o erro (sentido errado, frase difícil demais para o nível, tradução estranha). A taxa de correção manual é a métrica de qualidade proposta na seção 11.

| Português | Escrita | Pinyin | Classe | Significado | Frase | Lacuna | Checagem automática | Alertas da IA | Revisão humana |
|---|---|---|---|---|---|---|---|---|---|
${linhas.join("\n")}
${naoCriadas.length ? `\n## Cartas não criadas\n\n| Palavra | Ponte | Motivo |\n|---|---|---|\n${naoCriadas.map((n) => `| ${n.gloss} | ${n.ponte} | ${n.motivo} |`).join("\n")}\n` : ""}`;
mkdirSync("prototipos", { recursive: true });
const sufixo = `${carimbo}-${modeloUsado}`;
writeFileSync(`prototipos/modulo2-${sufixo}.md`, md);
writeFileSync(`prototipos/modulo2-${sufixo}.json`, JSON.stringify({ metricas, chamadas, wordList, resultados, cartas, naoCriadas }, null, 2));

console.log("\n" + Object.entries(metricas).map(([k, v]) => `${k}: ${v}`).join("\n"));
console.log(`\nRelatório: prototipos/modulo2-${sufixo}.md`);
