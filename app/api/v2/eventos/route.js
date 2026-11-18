import { usuarioAtual } from "@/lib/auth/server";
import { registrarEventos } from "@/lib/v2/eventosServidor.js";

export const maxDuration = 30;

export async function POST(request) {
  const pedido = (await request.json().catch(() => null)) || {};
  const eventos = Array.isArray(pedido.eventos) ? pedido.eventos : null;
  if (!eventos) return Response.json({ erro: "Payload inválido." }, { status: 400 });
  if (eventos.length > 200) return Response.json({ erro: "Lote grande demais." }, { status: 413 });
  if (!process.env.DATABASE_URL) return Response.json({ ok: true, ignorado: true });

  const usuario = await usuarioAtual();
  const deviceId = typeof pedido.dispositivo === "string" ? pedido.dispositivo : null;
  if (!usuario && !deviceId) return Response.json({ erro: "Sem identidade." }, { status: 400 });

  try {
    const { neon } = await import("@neondatabase/serverless");
    const resultado = await registrarEventos(neon(process.env.DATABASE_URL), {
      userId: usuario?.id ?? null,
      deviceId,
      eventos,
    });
    return Response.json(resultado);
  } catch (e) {
    console.error("[v2/eventos]", e?.message);
    if (e?.status === 429) return Response.json({ erro: e.message }, { status: 429 });
    if (e?.status === 400) return Response.json({ erro: e.message }, { status: 400 });
    return Response.json({ erro: "Não consegui registrar os eventos agora." }, { status: 500 });
  }
}
