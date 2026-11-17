"use client";
// Login no navegador: entrar, criar conta, sair e ler a sessão
import { createAuthClient } from "@neon/auth/next";

export const authClient = createAuthClient();

// { id, name, email, image } da pessoa logada, ou null
export async function sessaoAtual() {
  try {
    const { data } = await authClient.getSession();
    return data?.user ?? null;
  } catch {
    return null;
  }
}
