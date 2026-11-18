"use client";
// Canto do menu: "Entrar" para quem não está logado; nome e "Sair" para quem está
import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient, sessaoAtual } from "@/lib/auth/client";

// ligado=false quando o login não está configurado neste ambiente: nada aparece
export default function MenuConta({ ligado }) {
  const [usuario, setUsuario] = useState(undefined); // undefined = carregando
  useEffect(() => { if (ligado) sessaoAtual().then(setUsuario); }, [ligado]);

  if (!ligado || usuario === undefined) return null;
  if (!usuario) return <Link href="/entrar">Entrar</Link>;

  async function sair() {
    await authClient.signOut();
    window.location.href = "/";
  }
  return (
    <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <span className="mu menu-conta-nome" title={usuario.email}>{usuario.name || usuario.email}</span>
      <button className="v2-link" style={{ fontWeight: 600 }} onClick={sair}>Sair</button>
    </span>
  );
}
