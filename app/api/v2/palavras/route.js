// POST /api/v2/palavras  { theme, level, count, existing_words? }  ->  WordList (Módulo 1)
import { GoogleGenAI } from "@google/genai";
import { gerarPalavras, VERSAO_PROMPT_M1 } from "@/lib/v2/modulo1.js";
import { validarTema, LIMITES } from "@/lib/v2/portaEntrada.js";
import { escolherChave, respostaSemChave } from "@/lib/chaveServidor";
import dicionario from "@/lib/v2/dados/hsk.js";

export const maxDuration = 60;

// O Módulo 1 usa um modelo mais forte que o resto: o lite trocava caracteres (戹果 no lugar de 苹果)
// e fugia do tema, e aqui a chamada é pequena (poucas palavras curtas). O lite fica como reserva.
const MODELOS = [
  process.env.GEMINI_THEME_MODEL || "gemini-3.5-flash",
  process.env.GEMINI_TEXT_MODEL || "gemini-flash-lite-latest",
  ...(process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite,gemini-3.5-flash").split(","),
].map((m) => m.trim()).filter((m, i, l) => m && l.indexOf(m) === i);

export async function POST(request) {
  const { chave } = escolherChave(request);
  if (!chave) return respostaSemChave();

  const corpo = (await request.json().catch(() => ({}))) || {};
  const { tema, erro } = validarTema(corpo.theme);
  if (erro) return Response.json({ erro }, { status: 400 });
  const count = Number(corpo.count);
  if (!Number.isInteger(count) || count < LIMITES.minPalavras || count > LIMITES.maxPalavras) {
    return Response.json({ erro: `A quantidade precisa ser entre ${LIMITES.minPalavras} e ${LIMITES.maxPalavras}.` }, { status: 400 });
  }
  const existing_words = Array.isArray(corpo.existing_words) ? corpo.existing_words.slice(0, 500) : [];

  const ai = new GoogleGenAI({ apiKey: chave });
  let ultimo = null;
  for (const modelo of MODELOS) {
    try {
      const r = await gerarPalavras(ai, modelo, { theme: tema, level: corpo.level || "HSK 1", count, existing_words }, { dicionario });
      return Response.json({ ...r, modelo, versaoPrompt: VERSAO_PROMPT_M1 });
    } catch (e) {
      const status = Number(e?.status) || 0;
      ultimo = { status, detalhe: e?.message };
      console.error(`[v2/palavras] ${modelo} falhou (status ${status}): ${e?.message}`);
      if (status === 401 || status === 403) return Response.json({ erro: "O Google recusou a chave da API. Confira em Configurações." }, { status: 502 });
    }
  }
  return Response.json(
    { erro: ultimo?.status === 429 ? "Limite gratuito do Gemini atingido. Tente em um minuto." : "O Gemini não respondeu agora. Tente de novo.", detalhe: ultimo?.detalhe },
    { status: 502 }
  );
}
