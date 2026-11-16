// POST /api/v2/enriquecer  { wordList }  ->  palavras enriquecidas (Módulo 2)
// Roda no servidor: a chave (do visitante ou do .env.local) nunca vai para o navegador de terceiros.

import { GoogleGenAI } from "@google/genai";
import { enriquecer, VERSAO_PROMPT } from "@/lib/v2/modulo2.js";
import { LIMITES } from "@/lib/v2/portaEntrada.js";
import { escolherChave, respostaSemChave } from "@/lib/chaveServidor";
import dicionario from "@/lib/v2/dados/hsk.js";
import { consultarBanco, concluirComBanco } from "@/lib/v2/bancoPalavras.js";
import { bancoPalavrasPostgres } from "@/lib/v2/bancoPalavrasPostgres.js";

export const maxDuration = 60;

const MODELOS = [
  process.env.GEMINI_TEXT_MODEL || "gemini-flash-lite-latest",
  ...(process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite,gemini-3.5-flash").split(","),
].map((m) => m.trim()).filter((m, i, l) => m && l.indexOf(m) === i);

export async function POST(request) {
  // regerar: "Gerar de novo" ignora o banco de palavras e substitui a versão guardada
  const { wordList, regerar = false } = (await request.json().catch(() => ({}))) || {};
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

  // 1. Banco de palavras: as já geradas por alguém voltam prontas, sem gastar a cota
  let banco = null;
  try { banco = await bancoPalavrasPostgres(); } catch (e) { console.error("[banco de palavras] indisponível:", e?.message); }
  let consulta;
  try {
    consulta = await consultarBanco(wordList, { banco, versao: VERSAO_PROMPT, ignorar: regerar });
  } catch (e) {
    console.error("[banco de palavras] falhou na consulta, seguindo sem ele:", e?.message);
    banco = null;
    consulta = await consultarBanco(wordList, { banco: null, versao: VERSAO_PROMPT });
  }
  const { doBanco, faltam, chaves } = consulta;
  const responder = async (resultadosIA, extras = {}) => Response.json({
    resultados: await concluirComBanco(wordList, { doBanco, chaves, resultadosIA, banco, dicionario, versao: VERSAO_PROMPT, substituir: regerar }),
    doBanco: doBanco.size, versaoPrompt: VERSAO_PROMPT, ...extras,
  });
  if (!faltam.length) return responder([], { modelo: "banco de palavras", chamadas: [] });

  // 2. Só o que faltou vai para o Gemini (e só aqui a chave é necessária)
  const { chave } = escolherChave(request);
  if (!chave) return respostaSemChave();
  const ai = new GoogleGenAI({ apiKey: chave });
  let ultimo = null;
  for (const modelo of MODELOS) {
    try {
      const { resultados, chamadas } = await enriquecer(ai, modelo, { ...wordList, words: faltam });
      return responder(resultados, { chamadas, modelo });
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
