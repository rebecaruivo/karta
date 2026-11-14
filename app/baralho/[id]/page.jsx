"use client";
// Tela do baralho: resumo + lista de cartas
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { obterBaralho, excluirBaralho } from "@/lib/armazenamento";
import { IDIOMAS } from "@/lib/idiomas";
import { paraRevisar } from "@/lib/repeticao";

const ROTULO_STATUS = { nova: "Nova", aprendendo: "Em aprendizado", dominada: "Dominada" };

export default function Baralho() {
  const { id } = useParams();
  const router = useRouter();
  const [baralho, setBaralho] = useState(undefined);
  const [filtro, setFiltro] = useState("todas");

  useEffect(() => setBaralho(obterBaralho(id)), [id]);

  if (baralho === undefined) return null;
  if (baralho === null) return <p>Baralho não encontrado. <Link href="/">Voltar</Link></p>;

  const cfg = IDIOMAS[baralho.idioma];
  const paraHoje = baralho.cartas.filter((c) => paraRevisar(c)).length;
  const contar = (s) => baralho.cartas.filter((c) => c.status === s).length;
  const visiveis = filtro === "todas" ? baralho.cartas : baralho.cartas.filter((c) => c.status === filtro);

  function excluir() {
    if (!window.confirm("Excluir este baralho? Não dá para desfazer.")) return;
    excluirBaralho(baralho.id);
    router.push("/");
  }

  return (
    <>
      <Link href="/" className="mu">← Biblioteca</Link>
      <div className="cabecalho" style={{ marginTop: 12 }}>
        <div>
          <h1><span className="z">{cfg.sigla}</span> {baralho.tema}</h1>
          <p className="mu">{cfg.nome} · {baralho.nivel} · {baralho.cartas.length} cartas</p>
        </div>
        <div className="acoes">
          <Link href={`/baralho/${baralho.id}/estudar`} className="btn">Estudar ({paraHoje})</Link>
          <button className="bo" disabled title="Chega na fase 4">Exportar .apkg</button>
        </div>
      </div>

      {baralho.observacao && <p className="aviso" style={{ marginBottom: 20 }}>{baralho.observacao}</p>}

      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`ch ${filtro === "todas" ? "on" : ""}`} onClick={() => setFiltro("todas")}>Todas</button>
        {Object.entries(ROTULO_STATUS).map(([s, r]) => (
          <button key={s} className={`ch ${filtro === s ? "on" : ""}`} onClick={() => setFiltro(s)}>
            {r} ({contar(s)})
          </button>
        ))}
      </div>

      <div className="lr lh"><span>Palavra</span><span>{cfg.rotuloLeitura}</span><span>Tradução e exemplo</span><span>Status</span></div>
      {visiveis.map((c) => (
        <div className="lr" key={c.id}>
          <span className="pal z">{c.palavra}</span>
          <span className="mu" style={{ fontSize: 15 }}>{c.leitura}</span>
          <span>
            <strong>{c.traducao}</strong> <span className="mu">· {c.classe}</span><br />
            <span className="mu">{c.exemplo} — {c.exemploTraducao}</span>
          </span>
          <span><span className="tg">{ROTULO_STATUS[c.status]}</span></span>
        </div>
      ))}

      <p style={{ marginTop: 32 }}><button className="bo" onClick={excluir}>Excluir baralho</button></p>
      <p className="mu">Gerado com {baralho.modelo}</p>
    </>
  );
}
