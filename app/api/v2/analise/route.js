// POST /api/v2/analise  { resumo }  ->  diagnóstico do progresso com IA (aba "Progresso")
// Recebe só estatísticas agregadas (sem IDs); usa a chave do Gemini da pessoa, como o resto do Karta.
import { GoogleGenAI } from "@google/genai";
import { analisarProgresso, MINIMO_RESPOSTAS, VERSAO_PROMPT_ANALISE } from "@/lib/v2/analise.js";
import { escolherChave, respostaSemChave } from "@/lib/chaveServidor";

export const maxDuration = 60;

// Análise é uma chamada pequena e de leitura: um modelo mais capaz vale a pena (o lite fica de reserva)
const MODELOS = [
  process.env.GEMINI_ANALISE_MODEL || process.env.GEMINI_THEME_MODEL || "gemini-3.5-flash",
  process.env.GEMINI_TEXT_MODEL || "gemini-flash-lite-latest",
].map((m) => m.trim()).filter((m, i, l) => m && l.indexOf(m) === i);

export async function POST(request) {
  const texto = await request.text().catch(() => "");
  if (texto.length > 12000) return Response.json({ erro: "Resumo grande demais." }, { status: 413 });
  let resumo;
  try { resumo = JSON.parse(texto)?.resumo; } catch { /* inválido */ }
  if (!resumo || typeof resumo !== "object") return Response.json({ erro: "Resumo inválido." }, { status: 400 });
  if ((resumo.respostas_30_dias?.total ?? 0) < MINIMO_RESPOSTAS) {
    return Response.json({ erro: `Responda pelo menos ${MINIMO_RESPOSTAS} cartas para a análise ter base.` }, { status: 400 });
  }

  const { chave } = escolherChave(request);
  if (!chave) return respostaSemChave();
  const ai = new GoogleGenAI({ apiKey: chave });
  let ultimo = null;
  for (const modelo of MODELOS) {
    try {
      const analise = await analisarProgresso(ai, modelo, resumo);
      return Response.json({ ...analise, modelo, versaoPrompt: VERSAO_PROMPT_ANALISE });
    } catch (e) {
      const status = Number(e?.status) || 0;
      ultimo = { status, detalhe: e?.message };
      console.error(`[v2/analise] ${modelo} falhou (status ${status}): ${e?.message}`);
      if (status === 401 || status === 403) return Response.json({ erro: "O Google recusou a chave da API. Confira em Configurações." }, { status: 502 });
    }
  }
  return Response.json(
    { erro: ultimo?.status === 429 ? "Limite gratuito do Gemini atingido. Tente em um minuto." : "O Gemini não respondeu agora. Tente de novo." },
    { status: 502 }
  );
}
