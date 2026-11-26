// Quanto custa cada transação do Karta, em dinheiro.
//
// Toda chamada ao Gemini devolve quantos tokens usou (usageMetadata). Aqui esses tokens viram
// dólares pela tabela de preços do plano pago, e o dólar vira real por uma cotação fixa.
// Funções puras: nada de rede, para dar para testar (scripts/testar-custos.mjs).
//
// Importante: hoje cada pessoa usa a própria chave do Gemini, na faixa grátis, então o custo
// de verdade para ela é zero. Estes números respondem "quanto custaria se o Karta pagasse a conta"
// (plano pago, sem desconto de lote), que é a pergunta de quem decide escalar o produto.

export const PRECOS_CONSULTADOS_EM = "2026-11-26";
export const FONTES_PRECOS = [
  "https://ai.google.dev/gemini-api/docs/pricing",
  "https://cloud.google.com/vertex-ai/generative-ai/pricing", // só para o 3.5 Flash-Lite, que a página da API não lista
];
// Cotação aproximada do dólar comercial em nov/2026. Um lugar só para atualizar.
export const COTACAO_USD_BRL = 5.1;

// US$ por 1 milhão de tokens, plano pago, nível padrão. O "pensamento" (thinking) é cobrado como saída.
// Nos modelos de voz (TTS), a saída é áudio e tem preço próprio.
// A ordem importa: o primeiro padrão que casar com o id do modelo vale (mais específico primeiro).
export const PRECOS = [
  { padrao: /^gemini-3\.1-flash-tts/, nome: "Gemini 3.1 Flash TTS", entrada: 1.0, saida: 20.0, voz: true },
  { padrao: /^gemini-2\.5-flash(-preview)?-tts/, nome: "Gemini 2.5 Flash TTS", entrada: 0.5, saida: 10.0, voz: true },
  { padrao: /^gemini-2\.5-pro(-preview)?-tts/, nome: "Gemini 2.5 Pro TTS", entrada: 1.0, saida: 20.0, voz: true },
  { padrao: /^gemini-3\.5-flash-lite/, nome: "Gemini 3.5 Flash-Lite", entrada: 0.3, saida: 2.5 },
  { padrao: /^gemini-3\.1-flash-lite/, nome: "Gemini 3.1 Flash-Lite", entrada: 0.25, saida: 1.5 },
  { padrao: /^gemini-3\.5-flash(?!-lite)/, nome: "Gemini 3.5 Flash", entrada: 1.5, saida: 9.0 },
];

// Quando o id não está na tabela (um alias como "gemini-flash-lite-latest", ou um modelo novo),
// usa o preço da família, marcado como estimado: melhor um número aproximado e sinalizado do que nenhum.
const FAMILIAS = [
  { padrao: /tts/, preco: PRECOS[0] },          // TTS desconhecido: o mais caro da tabela (conservador)
  { padrao: /flash-lite/, preco: PRECOS[3] },   // Flash-Lite desconhecido: o mais caro dos Flash-Lite
  { padrao: /flash/, preco: PRECOS[5] },
];

export function precoDe(modelo) {
  const id = String(modelo ?? "").replace(/^models\//, "");
  const exato = PRECOS.find((p) => p.padrao.test(id));
  if (exato) return { ...exato, estimado: false };
  const familia = FAMILIAS.find((f) => f.padrao.test(id));
  return familia ? { ...familia.preco, estimado: true } : null;
}

// Lê o uso de uma resposta do Gemini. modelVersion diz qual modelo respondeu de fato
// (um alias "…-latest" aponta para um modelo específico, e é ele que é cobrado).
export function usoDaResposta(resposta, modeloPedido) {
  const u = resposta?.usageMetadata || {};
  return {
    modelo: resposta?.modelVersion || modeloPedido,
    entrada: u.promptTokenCount ?? 0,
    saida: u.candidatesTokenCount ?? 0,
    pensamento: u.thoughtsTokenCount ?? 0,
  };
}

// Custo de uma chamada. usd = null quando o modelo é desconhecido de todo.
export function custoDaChamada({ modelo, entrada = 0, saida = 0, pensamento = 0 }) {
  const preco = precoDe(modelo);
  const tokens = entrada + saida + pensamento;
  if (!preco) return { modelo, tokens, usd: null, estimado: true };
  const usd = (entrada * preco.entrada + (saida + pensamento) * preco.saida) / 1e6;
  return { modelo, tokens, usd, estimado: preco.estimado };
}

// Soma uma lista de chamadas (ou de custos já somados). Uma parcela sem preço deixa o total marcado.
export function somarCustos(lista) {
  return (lista || []).filter(Boolean).reduce(
    (t, c) => ({
      usd: t.usd + (c.usd ?? 0),
      tokens: t.tokens + (c.tokens ?? 0),
      chamadas: t.chamadas + (c.chamadas ?? 1),
      estimado: t.estimado || Boolean(c.estimado) || c.usd === null,
    }),
    { usd: 0, tokens: 0, chamadas: 0, estimado: false }
  );
}

// Formatação: frações de centavo precisam de mais casas, senão tudo vira "US$ 0,00".
export function formatarUsd(usd) {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  const casas = usd === 0 ? 2 : usd < 0.001 ? 6 : usd < 0.1 ? 4 : 2;
  return `US$ ${usd.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}
export function formatarBrl(usd, cotacao = COTACAO_USD_BRL) {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  const brl = usd * cotacao;
  const casas = brl === 0 ? 2 : brl < 0.01 ? 4 : 2;
  return `R$ ${brl.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}
