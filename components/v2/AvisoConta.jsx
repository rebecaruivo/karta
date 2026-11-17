"use client";
// Linha do topo da v2: onde os baralhos estão salvos e, logado, a oferta de levar
// para a conta os baralhos que estão só neste navegador.
import { useEffect, useState } from "react";
import Link from "next/link";
import { estadoDados, baralhosSoNoNavegador, levarParaConta } from "@/lib/v2/cliente";

export default function AvisoConta({ ligado }) {
  const [estado, setEstado] = useState(null);
  const [soLocal, setSoLocal] = useState([]);
  const [copiando, setCopiando] = useState(false);
  const [feito, setFeito] = useState(null);

  useEffect(() => {
    if (!ligado) return;
    estadoDados().then(async (e) => { setEstado(e); if (e.modo === "conta") setSoLocal(await baralhosSoNoNavegador()); });
  }, [ligado]);

  if (!ligado || !estado) return null;

  async function levar() {
    setCopiando(true);
    try {
      const r = await levarParaConta(soLocal.map((d) => d.id));
      setFeito(`${r.baralhos} baralho(s) copiado(s) para a sua conta.`);
      setSoLocal([]);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) { setFeito(`⚠ ${e.message}`); } finally { setCopiando(false); }
  }

  if (estado.modo === "navegador") {
    return <p className="mu" style={{ margin: "-12px 0 20px", fontSize: 13 }}>Seus baralhos estão salvos neste navegador. <Link href="/entrar" style={{ textDecoration: "underline" }}>Entre</Link> para guardá-los na sua conta e usar em qualquer aparelho.</p>;
  }
  return (
    <div style={{ margin: "-12px 0 20px", fontSize: 13 }}>
      <p className="mu" style={{ margin: 0 }}>Seus baralhos estão salvos na sua conta.</p>
      {soLocal.length > 0 && (
        <p style={{ margin: "8px 0 0" }}>
          {soLocal.length} baralho(s) deste navegador ainda não estão na conta ({soLocal.map((d) => d.name).join(", ")}).{" "}
          <button className="v2-link" onClick={levar} disabled={copiando}>{copiando ? "Copiando…" : "Levar para a minha conta"}</button>
        </p>
      )}
      {feito && <p style={{ margin: "8px 0 0" }}>{feito}</p>}
    </div>
  );
}
