// Login (fase 2): instância do Neon Auth no servidor.
// As contas e sessões ficam no próprio banco do Karta, no schema "neon_auth".
// Sem as variáveis abaixo (ex.: rodando sem o Auth ligado), o login fica desligado e o app funciona como antes.
import { createNeonAuth } from "@neon/auth/next/server";

export const authLigado = Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET);

export const auth = authLigado
  ? createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL,
      cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET },
    })
  : null;

// Usuário da sessão atual (ou null). Usado pelas rotas que gravam dados da pessoa.
export async function usuarioAtual() {
  if (!auth) return null;
  try {
    const { data } = await auth.getSession();
    return data?.user ?? null;
  } catch {
    return null;
  }
}
