// Decide qual chave a rota do servidor usa:
// 1) a do visitante (cabeçalho x-gemini-key), se veio;
// 2) senão, a do servidor (GEMINI_API_KEY), que só existe no seu computador.
// No Vercel não configuramos GEMINI_API_KEY, então visitantes precisam da própria.
export function escolherChave(request) {
  const doVisitante = (request.headers.get("x-gemini-key") || "").trim();
  if (doVisitante && doVisitante.length < 200) return { chave: doVisitante, origem: "visitante" };
  if (process.env.GEMINI_API_KEY) return { chave: process.env.GEMINI_API_KEY, origem: "servidor" };
  return { chave: null, origem: null };
}

export const respostaSemChave = () =>
  Response.json(
    { erro: "Para gerar, cole a sua chave do Gemini (é grátis) em Configurações.", codigo: "sem-chave" },
    { status: 401 }
  );
