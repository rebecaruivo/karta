"use client";
// Lista de baralhos, agrupada por idioma. A criação fica em /novo.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { obterRepo } from "@/lib/v2/cliente";
import { carregarDemoV2 } from "@/lib/v2/demo.js";
import { idiomaV2 } from "@/lib/v2/idiomas.js";

export default function BaralhosV2() {
  const router = useRouter();
  const [baralhos, setBaralhos] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [abrindoDemo, setAbrindoDemo] = useState(false);
  const [erroDemo, setErroDemo] = useState(null);
  async function abrirDemo() {
    setAbrindoDemo(true);
    try {
      const deck = await carregarDemoV2();
      router.push(`/baralho/${deck.id}`);
    } catch (e) {
      setErroDemo(e.message);
      setAbrindoDemo(false);
    }
  }
  useEffect(() => { obterRepo().then((r) => r.listarBaralhos()).then(setBaralhos); }, []);
  if (baralhos === null) return null;

  const comIdioma = baralhos.map((b) => ({ ...b, codigo: idiomaV2(b.target_language).codigo }));
  const usados = [...new Set(comIdioma.map((b) => b.codigo))];
  const visiveis = filtro === "todos" ? comIdioma : comIdioma.filter((b) => b.codigo === filtro);
  const grupos = usados
    .map((codigo) => ({ codigo, cfg: idiomaV2(codigo), itens: visiveis.filter((b) => b.codigo === codigo) }))
    .filter((g) => g.itens.length);

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Baralhos</h1>
          <p className="mu">Cada palavra vira até 7 cartas, uma para cada conexão. Escolha o idioma e o nível.</p>
        </div>
        <div className="acoes"><Link href="/novo" className="btn">+ Novo baralho</Link></div>
      </div>

      {baralhos.length === 0 && (
        <div className="vazio">
          <p className="mu" style={{ margin: "24px 0" }}>Você ainda não tem baralhos. Crie o primeiro ou abra o exemplo para ver as cartas por conexão.</p>
          <div className="acoes">
            <button className="btn" onClick={abrirDemo} disabled={abrindoDemo}>
              {abrindoDemo ? "Abrindo…" : "Ver baralho de exemplo"}
            </button>
            <Link href="/novo" className="bo">Criar meu baralho</Link>
          </div>
          {erroDemo && <p className="erro" style={{ marginTop: 16 }}>{erroDemo}</p>}
        </div>
      )}

      {usados.length > 1 && (
        <div className="chips" style={{ marginBottom: 20 }}>
          <button className={`ch ${filtro === "todos" ? "on" : ""}`} onClick={() => setFiltro("todos")}>Todos</button>
          {usados.map((codigo) => (
            <button key={codigo} className={`ch ${filtro === codigo ? "on" : ""}`} onClick={() => setFiltro(codigo)}>
              {idiomaV2(codigo).nome}
            </button>
          ))}
        </div>
      )}

      {grupos.length === 0 && baralhos.length > 0 && (
        <p className="mu">Nenhum baralho neste idioma.</p>
      )}

      {grupos.map((g) => (
        <section key={g.codigo} className="grupo" style={{ marginBottom: 28 }}>
          <h2 className="d" style={{ fontSize: 20, margin: "0 0 12px" }}>
            {g.cfg.nome} <span className="mu">· {g.itens.length} {g.itens.length === 1 ? "baralho" : "baralhos"}</span>
          </h2>
          <div className="grade">
            {g.itens.map((b) => (
              <Link key={b.id} href={`/baralho/${b.id}`} className="t tom-0">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="sig z">{g.cfg.sigla}</span><span className="tg" style={{ alignSelf: "flex-start" }}>{b.level}</span>
                </div>
                <span className="nome">{b.name}</span>
                <span className="mu">{b.palavras} palavras · {b.cartas} cartas</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
