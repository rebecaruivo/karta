// POST /api/v2/dados  { op, tabela, ... }  ->  dados de quem está logado (baralhos no banco, fase 2)
// O usuário vem da sessão do login; o navegador nunca diz de quem são os dados.
import { usuarioAtual } from "@/lib/auth/server";
import { executar } from "@/lib/v2/dadosServidor.js";

export async function POST(request) {
  const usuario = await usuarioAtual();
  if (!usuario) return Response.json({ erro: "Entre na sua conta para usar os baralhos salvos." }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ erro: "Banco não configurado." }, { status: 503 });

  const pedido = (await request.json().catch(() => null)) || {};
  try {
    const { neon } = await import("@neondatabase/serverless");
    const resultado = await executar(neon(process.env.DATABASE_URL), usuario.id, pedido);
    return Response.json({ resultado: resultado ?? null });
  } catch (e) {
    console.error("[v2/dados]", pedido.op, pedido.tabela, e?.message);
    const conhecido = /desconhecid/.test(e?.message || "");
    return Response.json({ erro: conhecido ? e.message : "Não consegui acessar o banco agora." }, { status: conhecido ? 400 : 500 });
  }
}
