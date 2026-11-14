// Diagnóstico da conexão com o Gemini.
// Uso: npm run diagnostico
// 1) confere se a chave existe
// 2) testa vários modelos e mede quais estão respondendo AGORA e em quanto tempo
// 3) sugere a configuração do .env.local

import { GoogleGenAI } from "@google/genai";

const chave = process.env.GEMINI_API_KEY;
if (!chave) {
  console.log("✗ GEMINI_API_KEY não encontrada no .env.local");
  process.exit(1);
}
console.log(`✓ Chave encontrada (começa com ${chave.slice(0, 3)}, ${chave.length} caracteres)`);

const configurados = [
  process.env.GEMINI_TEXT_MODEL,
  ...(process.env.GEMINI_FALLBACK_MODEL || "").split(","),
].map((m) => (m || "").trim()).filter(Boolean);

const candidatos = [...new Set([
  ...configurados,
  "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash",
  "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.1-flash-lite",
])];

const ai = new GoogleGenAI({ apiKey: chave });

async function testar(modelo) {
  const inicio = Date.now();
  try {
    await ai.models.generateContent({ model: modelo, contents: "Responda só: ok" });
    return { modelo, ok: true, ms: Date.now() - inicio };
  } catch (e) {
    const causa = e?.cause?.code ? ` · ${e.cause.code}` : "";
    const motivo = { 503: "sobrecarregado", 404: "indisponível para esta chave", 429: "limite gratuito", 0: "falha de rede" }[e?.status || 0] || `erro ${e?.status}`;
    return { modelo, ok: false, motivo: motivo + causa };
  }
}

console.log("\nTestando modelos (em paralelo)…\n");
const resultados = await Promise.all(candidatos.map(testar));
for (const r of resultados) {
  const marca = configurados.includes(r.modelo) ? " (configurado)" : "";
  console.log(r.ok ? `✓ ${r.modelo.padEnd(26)} ${r.ms} ms${marca}` : `✗ ${r.modelo.padEnd(26)} ${r.motivo}${marca}`);
}

const bons = resultados.filter((r) => r.ok).sort((a, b) => a.ms - b.ms);
if (!bons.length) {
  console.log("\nNenhum modelo respondeu agora. Se todos deram 'falha de rede', o problema é a conexão; se deram 'sobrecarregado', espere alguns minutos.");
} else {
  console.log("\nSugestão para o .env.local (do mais rápido para o mais lento):");
  console.log(`GEMINI_TEXT_MODEL=${bons[0].modelo}`);
  if (bons.length > 1) console.log(`GEMINI_FALLBACK_MODEL=${bons.slice(1, 3).map((r) => r.modelo).join(",")}`);
}
