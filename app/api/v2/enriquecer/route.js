// POST /api/v2/enriquecer  { wordList }  ->  palavras enriquecidas (Módulo 2)
// Roda no servidor: a chave (do visitante ou do .env.local) nunca vai para o navegador de terceiros.

import { GoogleGenAI } from "@google/genai";
import { enriquecer, VERSAO_PROMPT } from "@/lib/v2/modulo2.js";
import { LIMITES } from "@/lib/v2/portaEntrada.js";
import { escolherChave, respostaSemChave } from "@/lib/chaveServidor";
import { idiomaOpcional } from "@/lib/v2/idiomas.js";
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
  const cfg = idiomaOpcional(wordList.target_language);
  if (!cfg) return Response.json({ erro: "Idioma inválido." }, { status: 400 });
  if (!cfg.niveis.includes(wordList.level)) return Response.json({ erro: "Nível inválido para esse idioma." }, { status: 400 });

  // O lemma vem do navegador: só aceita escrita válida do idioma e, no mandarim, só palavra da lista do HSK.
  // Fora disso, descarta e o Módulo 2 traduz de novo a partir do português.
  const dicionarioDoIdioma = cfg.codigo === "zh" ? dicionario : null;
  for (const p of palavras) {
    const chinesTamanhoOk = cfg.codigo !== "zh" || (p.lemma || "").length <= 8;
    if (p.lemma && (!chinesTamanhoOk || !cfg.escritaRegex.test(p.lemma) || (dicionarioDoIdioma && dicionarioDoIdioma[p.lemma] === undefined))) p.lemma = null;
    if (p.origin !== "ai" && p.origin !== "user") delete p.origin;
  }
  const lista = { ...wordList, target_language: cfg.codigo };

  // 1. Banco de palavras: as já geradas por alguém voltam prontas, sem gastar a cota
  let banco = null;
  try { banco = await bancoPalavrasPostgres(); } catch (e) { console.error("[banco de palavras] indisponível:", e?.message); }
  let consulta;
  try {
    consulta = await consultarBanco(lista, { banco, versao: VERSAO_PROMPT, ignorar: regerar });
  } catch (e) {
    console.error("[banco de palavras] falhou na consulta, seguindo sem ele:", e?.message);
    banco = null;
    consulta = await consultarBanco(lista, { banco: null, versao: VERSAO_PROMPT });
  }
  const { doBanco, faltam, chaves } = consulta;
  const responder = async (resultadosIA, extras = {}) => Response.json({
    resultados: await concluirComBanco(lista, { doBanco, chaves, resultadosIA, banco, dicionario: dicionarioDoIdioma, versao: VERSAO_PROMPT, substituir: regerar }),
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
      const { resultados, chamadas } = await enriquecer(ai, modelo, { ...lista, words: faltam });
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
