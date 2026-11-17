// Todas as requisições de login passam por aqui e seguem para o Neon Auth
import { auth } from "@/lib/auth/server";

const desligado = () => Response.json({ erro: "Login não configurado neste ambiente." }, { status: 503 });
const h = auth ? auth.handler() : {};
export const GET = h.GET ?? desligado;
export const POST = h.POST ?? desligado;
export const PUT = h.PUT ?? desligado;
export const PATCH = h.PATCH ?? desligado;
export const DELETE = h.DELETE ?? desligado;
