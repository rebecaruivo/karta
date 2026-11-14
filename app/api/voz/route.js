// POST /api/voz  { texto }  ->  áudio WAV
// Mesma estratégia da geração de texto: modelo principal, reservas,
// novas tentativas em sobrecarga e tempo limite por chamada.

import { GoogleGenAI } from "@google/genai";
import { pcmParaWav, removerCertificadoC2PA } from "@/lib/wav";

const MODELOS = [
  process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts",
  ...(process.env.GEMINI_TTS_FALLBACK || "gemini-2.5-flash-preview-tts,gemini-3.1-flash-tts-preview").split(","),
]
  .map((m) => m.trim())
  .filter((m, i, lista) => m && lista.indexOf(m) === i);

const VOZ = process.env.GEMINI_TTS_VOICE || "Kore";
const LIMITE_TEXTO = 200; // caracteres: evita uso abusivo da rota
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function POST(request) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ erro: "Falta a GEMINI_API_KEY no arquivo .env.local." }, { status: 500 });
  }
  const { texto } = (await request.json().catch(() => ({}))) || {};
  if (typeof texto !== "string" || !texto.trim() || texto.length > LIMITE_TEXTO) {
    return Response.json({ erro: `Texto inválido (1 a ${LIMITE_TEXTO} caracteres).` }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let ultimo = null;

  for (const modelo of MODELOS) {
    for (let t = 1; t <= 2; t++) {
      try {
        const r = await ai.models.generateContent({
          model: modelo,
          contents: texto.trim(),
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ } } },
            httpOptions: { timeout: 20_000 },
          },
        });
        const dados = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
        if (!dados) throw Object.assign(new Error("Resposta sem áudio."), { status: 500 });

        // Remove o certificado C2PA que alguns modelos colam no fim do áudio (senão vira chiado)
        const { pcm, removidos } = removerCertificadoC2PA(Buffer.from(dados, "base64"));
        if (removidos) console.log(`[voz] ${modelo}: ${removidos} bytes de certificado C2PA removidos`);
        const wav = pcmParaWav(pcm);
        return new Response(wav, {
          headers: { "Content-Type": "audio/wav", "X-Modelo": modelo, "Cache-Control": "no-store" },
        });
      } catch (e) {
        const status = Number(e?.status) || 0;
        ultimo = { status, detalhe: e?.message || String(e) };
        console.error(`[voz] ${modelo} tentativa ${t} falhou (status ${status}): ${ultimo.detalhe}`);

        if (status === 401 || status === 403) {
          return Response.json({ erro: "O Google recusou a chave da API.", detalhe: ultimo.detalhe }, { status: 502 });
        }
        if (status === 429) break; // cota deste modelo acabou: tenta o próximo
        const temporario = status === 503 || status === 500 || status === 0;
        if (!temporario) break;
        if (t === 1) await esperar(1000);
      }
    }
  }

  const semCota = ultimo?.status === 429;
  return Response.json(
    {
      erro: semCota
        ? "Limite gratuito de voz atingido. Os áudios já gerados ficaram salvos; tente de novo em um minuto."
        : "Não foi possível gerar o áudio agora.",
      detalhe: ultimo?.detalhe,
    },
    { status: semCota ? 429 : 502 }
  );
}
