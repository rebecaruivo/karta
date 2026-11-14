// Diagnóstico de voz (TTS) do Gemini.
// Uso: npm run diagnostico:voz
// Testa cada modelo de voz disponível para a chave, pelos dois caminhos da API
// (generateContent e o endpoint novo "Interactions"), e salva um .wav de amostra.

import { GoogleGenAI } from "@google/genai";
import { writeFileSync, mkdirSync } from "node:fs";
import { pcmParaWav, removerCertificadoC2PA } from "../lib/wav.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const TEXTO = "你好，我喜欢吃苹果。"; // "Olá, eu gosto de comer maçã."
const VOZ = "Kore";

// Procura o primeiro trecho de áudio em base64 em qualquer formato de resposta
function acharAudio(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj.data === "string" && obj.data.length > 1000) return obj;
  for (const v of Object.values(obj)) { const r = acharAudio(v); if (r) return r; }
  return null;
}

function motivo(e) {
  const s = e?.status;
  return ({ 404: "modelo indisponível", 429: "sem cota (TTS pode não ser gratuito)", 503: "sobrecarregado", 400: "pedido recusado" }[s] || `erro ${s ?? "de rede"}`)
    + ` · ${String(e?.message).slice(0, 140)}`;
}

const modelos = [];
for await (const m of await ai.models.list()) {
  if (/tts/.test(m.name)) modelos.push(m.name.replace("models/", ""));
}
console.log(`Modelos de voz para esta chave: ${modelos.join(", ") || "(nenhum)"}\n`);
mkdirSync("amostras-voz", { recursive: true });

for (const modelo of modelos) {
  // Caminho 1: generateContent
  let inicio = Date.now();
  try {
    const r = await ai.models.generateContent({
      model: modelo,
      contents: TEXTO,
      config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ } } } },
    });
    const audio = acharAudio(r);
    if (!audio) throw new Error("resposta sem áudio");
    const arq = `amostras-voz/${modelo}-generateContent.wav`;
    writeFileSync(arq, pcmParaWav(removerCertificadoC2PA(Buffer.from(audio.data, "base64")).pcm));
    console.log(`✓ ${modelo} · generateContent · ${Date.now() - inicio} ms · ${audio.mimeType || "?"} → ${arq}`);
  } catch (e) {
    console.log(`✗ ${modelo} · generateContent · ${motivo(e)}`);
  }

  // Caminho 2: Interactions (endpoint novo)
  inicio = Date.now();
  try {
    const r = await ai.interactions.create({
      model: modelo,
      input: TEXTO,
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: VOZ }] },
    });
    const audio = acharAudio(r);
    if (!audio) throw new Error("resposta sem áudio: " + JSON.stringify(r).slice(0, 120));
    const arq = `amostras-voz/${modelo}-interactions.wav`;
    writeFileSync(arq, pcmParaWav(removerCertificadoC2PA(Buffer.from(audio.data, "base64")).pcm));
    console.log(`✓ ${modelo} · interactions · ${Date.now() - inicio} ms · ${audio.mime_type || audio.mimeType || "?"} → ${arq}`);
  } catch (e) {
    console.log(`✗ ${modelo} · interactions · ${motivo(e)}`);
  }
}
console.log("\nOuça os .wav da pasta amostras-voz/ e diga qual soou melhor.");
