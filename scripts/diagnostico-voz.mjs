// Diagnóstico de voz (TTS) do Gemini.
// Uso: npm run diagnostico:voz
// Testa cada modelo de voz disponível para a chave, pelos dois caminhos da API
// (generateContent e o endpoint novo "Interactions"), e salva um .wav de amostra.

import { GoogleGenAI } from "@google/genai";
import { writeFileSync, mkdirSync } from "node:fs";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const TEXTO = "你好，我喜欢吃苹果。"; // "Olá, eu gosto de comer maçã."
const VOZ = "Kore";

// O Gemini devolve áudio PCM cru (24 kHz, 16 bits, mono). Para tocar, precisa de um cabeçalho WAV.
function pcmParaWav(pcm, taxa = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(taxa, 24); h.writeUInt32LE(taxa * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

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
    writeFileSync(arq, pcmParaWav(Buffer.from(audio.data, "base64")));
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
    writeFileSync(arq, pcmParaWav(Buffer.from(audio.data, "base64")));
    console.log(`✓ ${modelo} · interactions · ${Date.now() - inicio} ms · ${audio.mime_type || audio.mimeType || "?"} → ${arq}`);
  } catch (e) {
    console.log(`✗ ${modelo} · interactions · ${motivo(e)}`);
  }
}
console.log("\nOuça os .wav da pasta amostras-voz/ e diga qual soou melhor.");
