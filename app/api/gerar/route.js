// POST /api/gerar
// Roda no SERVIDOR (no Vercel, vira uma função serverless).
// Por isso a chave GEMINI_API_KEY nunca chega ao navegador.

import { GoogleGenAI } from "@google/genai";
import { INSTRUCAO_SISTEMA, montarPedido, SCHEMA_BARALHO } from "@/lib/prompt";
import { validarPedido, limparCartas } from "@/lib/validar";
import { escolherChave, respostaSemChave } from "@/lib/chaveServidor";

// Tempo máximo da função no Vercel (segundos): a geração com novas tentativas pode passar de 10 s
export const maxDuration = 60;

// Modelo principal e modelo reserva. Se o principal estiver sobrecarregado
// ou indisponível, o app tenta o reserva antes de desistir.
// GEMINI_FALLBACK_MODEL aceita vários nomes separados por vírgula.
const MODELOS = [
  process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash",
  ...(process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-latest,gemini-flash-lite-latest").split(","),
]
  .map((m) => m.trim())
  .filter((m, i, lista) => m && lista.indexOf(m) === i);

const TENTATIVAS_POR_MODELO = 3;
const LIMITE_MS = 30_000; // 30 s por chamada
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Classifica o erro: vale tentar de novo? vale trocar de modelo?
function classificar(e) {
  const status = Number(e?.status || e?.code) || 0;
  return {
    status,
    // "fetch failed" esconde a causa real (ex.: ECONNRESET, timeout) em e.cause
    detalhe: [e?.message || String(e), e?.cause?.code || e?.cause?.message].filter(Boolean).join(" · "),
    temporario: status === 503 || status === 500 || status === 0, // sobrecarga, falha interna, rede
    modeloIndisponivel: status === 404,
  };
}

async function gerarCom(ai, modelo, pedido) {
  const resposta = await ai.models.generateContent({
    model: modelo,
    contents: pedido,
    config: {
      systemInstruction: INSTRUCAO_SISTEMA,
      responseMimeType: "application/json",
      responseSchema: SCHEMA_BARALHO,
      // Tempo limite por chamada: um modelo lento passa a vez ao próximo
      httpOptions: { timeout: LIMITE_MS },
    },
  });
  try {
    return JSON.parse(resposta.text);
  } catch {
    // JSON quebrado também conta como falha temporária: vale tentar de novo
    const erro = new Error("A resposta do modelo não era um JSON válido.");
    erro.status = 500;
    throw erro;
  }
}

export async function POST(request) {
  // 1) Confere a configuração e o pedido
  const { chave } = escolherChave(request);
  if (!chave) return respostaSemChave();
  const body = await request.json().catch(() => null);
  const erroPedido = validarPedido(body);
  if (erroPedido) return Response.json({ erro: erroPedido }, { status: 400 });

  const ai = new GoogleGenAI({ apiKey: chave });
  const pedido = montarPedido(body);

  // 2) Tenta cada modelo; em erro temporário, espera e repete (1s, 2s, 4s)
  let dados = null, modeloUsado = null, ultimo = null;
  for (const modelo of MODELOS) {
    for (let t = 1; t <= TENTATIVAS_POR_MODELO; t++) {
      try {
        dados = await gerarCom(ai, modelo, pedido);
        modeloUsado = modelo;
        break;
      } catch (e) {
        ultimo = classificar(e);
        console.error(`[gerar] ${modelo} tentativa ${t} falhou (status ${ultimo.status}): ${ultimo.detalhe}`);

        if (ultimo.status === 401 || ultimo.status === 403) {
          return Response.json(
            { erro: "O Google recusou a chave da API. Confira a chave em Configurações.", detalhe: ultimo.detalhe },
            { status: 502 }
          );
        }
        if (ultimo.status === 429) {
          return Response.json(
            { erro: "Limite de uso gratuito do Gemini atingido. Espere um minuto e tente de novo.", detalhe: ultimo.detalhe },
            { status: 429 }
          );
        }
        if (ultimo.modeloIndisponivel || !ultimo.temporario) break; // passa para o próximo modelo
        if (t < TENTATIVAS_POR_MODELO) await esperar(1000 * 2 ** (t - 1));
      }
    }
    if (dados) break;
  }

  if (!dados) {
    const sobrecarga = ultimo?.status === 503;
    return Response.json(
      {
        erro: sobrecarga
          ? "Os modelos do Gemini estão sobrecarregados agora. Tente de novo em alguns minutos."
          : "O Gemini não respondeu como esperado. Tente de novo.",
        detalhe: ultimo?.detalhe,
      },
      { status: 502 }
    );
  }

  // 3) Confere a qualidade e devolve
  const { limpas, descartadas } = limparCartas(dados.cartas);
  if (limpas.length === 0) {
    return Response.json({ erro: "Nenhuma carta válida foi gerada. Tente outro tema." }, { status: 502 });
  }

  return Response.json({
    cartas: limpas,
    descartadas,
    observacao: dados.observacao || null,
    modelo: modeloUsado,
  });
}
