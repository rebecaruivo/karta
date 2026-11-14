"use client";
// Tela inicial: Biblioteca de baralhos, agrupada por idioma.
// O tom do cartão fica mais intenso conforme mais cartas são dominadas.
import { useEffect, useState } from "react";
import Link from "next/link";
import { listarBaralhos } from "@/lib/armazenamento";
import { IDIOMAS } from "@/lib/idiomas";

function tom(pct) {
  if (pct >= 50) return "tom-2";
  if (pct >= 20) return "tom-1";
  return "tom-0";
}

export default function Biblioteca() {
  const [baralhos, setBaralhos] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [busca, setBusca] = useState("");

  // localStorage só existe no navegador, por isso a leitura fica no useEffect
  useEffect(() => setBaralhos(listarBaralhos()), []);
  if (baralhos === null) return null;

  const totalCartas = baralhos.reduce((s, b) => s + b.cartas.length, 0);
  const idiomasUsados = [...new Set(baralhos.map((b) => b.idioma))];
  const termo = busca.trim().toLowerCase();
  const visiveis = baralhos.filter(
    (b) => (filtro === "todos" || b.idioma === filtro) && (!termo || b.tema.toLowerCase().includes(termo))
  );
  const grupos = idiomasUsados
    .map((i) => ({ idioma: i, itens: visiveis.filter((b) => b.idioma === i) }))
    .filter((g) => g.itens.length);

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Biblioteca</h1>
          <p className="mu">{baralhos.length} baralhos · {totalCartas} cartas</p>
        </div>
        <Link href="/novo" className="btn">+ Novo baralho</Link>
      </div>

      {baralhos.length === 0 ? (
        <div className="vazio">
          <p className="d" style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Nenhum baralho ainda</p>
          <p className="mu" style={{ marginBottom: 20 }}>Escolha um idioma e um tema, e a IA monta as cartas para você.</p>
          <Link href="/novo" className="btn">Criar o primeiro baralho</Link>
        </div>
      ) : (
        <>
          <div className="chips" style={{ marginBottom: 14, alignItems: "center" }}>
            <input className="fi" style={{ maxWidth: 320, padding: "9px 16px", borderRadius: 999 }}
              placeholder="Buscar baralhos" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <button className={`ch ${filtro === "todos" ? "on" : ""}`} onClick={() => setFiltro("todos")}>Todos</button>
            {idiomasUsados.map((i) => (
              <button key={i} className={`ch ${filtro === i ? "on" : ""}`} onClick={() => setFiltro(i)}>
                {IDIOMAS[i].nome}
              </button>
            ))}
          </div>
          <div className="legenda mu">
            Mais decoradas, tom mais intenso <i className="tom-0" /><i className="tom-1" /><i className="tom-2" />
          </div>

          {grupos.length === 0 && <p className="mu">Nenhum baralho encontrado.</p>}
          {grupos.map((g) => (
            <section key={g.idioma} className="grupo">
              <h2 className="d">{IDIOMAS[g.idioma].nome} <span className="mu">· {g.itens.length} {g.itens.length === 1 ? "baralho" : "baralhos"}</span></h2>
              <div className="grade">
                {g.itens.map((b) => {
                  const dominadas = b.cartas.filter((c) => c.status === "dominada").length;
                  const pct = Math.round((dominadas / b.cartas.length) * 100);
                  return (
                    <Link key={b.id} href={`/baralho/${b.id}`} className={`t ${tom(pct)}`}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="sig z">{IDIOMAS[b.idioma].sigla}</span>
                        <span className="tg" style={{ alignSelf: "flex-start" }}>{b.nivel}</span>
                      </div>
                      <span className="nome">{b.tema}</span>
                      <span className="mu">{b.cartas.length} cartas · {dominadas} decoradas</span>
                      <div className="bar"><div style={{ width: `${pct}%` }} /></div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
