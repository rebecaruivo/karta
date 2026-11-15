// POST /api/v2/enriquecer  { wordList }  ->  palavras enriquecidas (Módulo 2)
// Roda no servidor: a chave (do visitante ou do .env.local) nunca vai para o navegador de terceiros.

import { GoogleGenAI } from "@google/genai";
import { enriquecer, VERSAO_PROMPT } from "@/lib/v2/modulo2.js";
import { LIMITES } from "@/lib/v2/portaEntrada.js";
import { escolherChave, respostaSemChave } from "@/lib/chaveServidor";
import dicionario from "@/lib/v2/dados/hsk.js";

export const maxDuration = 60;

const MODELOS = [
  process.env.GEMINI_TEXT_MODEL || "gemini-flash-lite-latest",
  ...(process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite,gemini-3.5-flash").split(","),
].map((m) => m.trim()).filter((m, i, l) => m && l.indexOf(m) === i);

export async function POST(request) {
  const { chave } = escolherChave(request);
  if (!chave) return respostaSemChave();

  const { wordList } = (await request.json().catch(() => ({}))) || {};
  const palavras = wordList?.words;
  if (!Array.isArray(palavras) || !palavras.length || palavras.length > LIMITES.maxPalavras) {
    return Response.json({ erro: `Envie de 1 a ${LIMITES.maxPalavras} palavras.` }, { status: 400 });
  }
  if (wordList.target_language !== "zh") {
    return Response.json({ erro: "Nesta versão, só o mandarim está disponível (perfil de referência)." }, { status: 400 });
  }

  // O lemma vem do navegador: só aceita até 8 caracteres chineses e, se a lista do HSK existir, só palavra da lista.
  // Fora disso, descarta e o Módulo 2 traduz de novo a partir do português.
  for (const p of palavras) {
    if (p.lemma && (!/^[\u3400-\u9fff]{1,8}$/u.test(p.lemma) || (dicionario && dicionario[p.lemma] === undefined))) p.lemma = null;
    if (p.origin !== "ai" && p.origin !== "user") delete p.origin;
  }

  const ai = new GoogleGenAI({ apiKey: chave });
  let ultimo = null;
  for (const modelo of MODELOS) {
    try {
      const { resultados, chamadas } = await enriquecer(ai, modelo, wordList);
      return Response.json({ resultados, chamadas, modelo, versaoPrompt: VERSAO_PROMPT });
    } catch (e) {
      const status = Number(e?.status) || 0;
      ultimo = { status, detalhe: e?.message };
      console.error(`[v2/enriquecer] ${modelo} falhou (status ${status}): ${e?.message}`);
      if (status === 401 || status === 403) {
        return Response.json({ erro: "O Google recusou a chave da API. Confira em Configurações." }, { status: 502 });
      }
      // 429, 503, 404, JSON inválido: tenta o próximo modelo
    }
  }
  return Response.json(
    { erro: ultimo?.status === 429 ? "Limite gratuito do Gemini atingido. Tente em um minuto." : "O Gemini não respondeu agora. Tente de novo.", detalhe: ultimo?.detalhe },
    { status: 502 }
  );
}
