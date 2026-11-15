"use client";
// v2 · Lista de baralhos. A criação fica numa página própria (/v2/novo).
import { useEffect, useState } from "react";
import Link from "next/link";
import { obterRepo } from "@/lib/v2/cliente";

export default function BaralhosV2() {
  const [baralhos, setBaralhos] = useState(null);
  useEffect(() => { obterRepo().then((r) => r.listarBaralhos()).then(setBaralhos); }, []);

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Baralhos (v2)</h1>
          <p className="mu">Cada palavra vira até 7 cartas, uma para cada conexão. Nesta versão, só mandarim.</p>
        </div>
        <div className="acoes"><Link href="/v2/novo" className="btn">+ Novo baralho</Link></div>
      </div>

      {baralhos?.length === 0 && (
        <p className="mu" style={{ margin: "24px 0" }}>Você ainda não tem baralhos na v2. Clique em <strong>Novo baralho</strong> para criar o primeiro.</p>
      )}
      {baralhos?.length > 0 && (
        <div className="grade">
          {baralhos.map((b) => (
            <Link key={b.id} href={`/v2/baralho/${b.id}`} className="t tom-0">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="sig z">中</span><span className="tg" style={{ alignSelf: "flex-start" }}>{b.level}</span>
              </div>
              <span className="nome">{b.name}</span>
              <span className="mu">{b.palavras} palavras · {b.cartas} cartas</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
