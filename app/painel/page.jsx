// Painel de produto: só para administradoras (e-mail verificado na lista ADMIN_EMAILS).
// Componente de servidor: as consultas rodam no servidor e nada disso chega ao navegador de quem não é admin.
import "../progresso/progresso.css";
import "./painel.css";
import { notFound } from "next/navigation";
import { usuarioAtual } from "@/lib/auth/server";
import { ehAdmin } from "@/lib/auth/admin";
import { coletarMetricas } from "@/lib/v2/metricas";
import { montarPainel } from "@/lib/v2/painel";
import PainelVisao from "@/components/painel/PainelVisao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel · Karta", robots: { index: false } };

export default async function Painel() {
  const usuario = await usuarioAtual();
  if (!ehAdmin(usuario)) notFound();
  if (!process.env.DATABASE_URL) return <p className="erro">Banco não configurado (DATABASE_URL ausente).</p>;

  let m;
  try {
    const { neon } = await import("@neondatabase/serverless");
    m = await coletarMetricas(neon(process.env.DATABASE_URL));
  } catch (e) {
    return <p className="erro">Não consegui carregar as métricas agora. {e?.message}</p>;
  }
  const p = montarPainel(m);

  return <PainelVisao p={p} geradoEm={m.geradoEm} />;
}
