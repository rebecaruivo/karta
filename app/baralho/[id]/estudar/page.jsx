"use client";
// Tela de estudo: mostra a palavra, revela a resposta e agenda a próxima revisão
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { obterBaralho, salvarBaralho } from "@/lib/armazenamento";
import { responder, montarFila, RESPOSTAS } from "@/lib/repeticao";
import { IDIOMAS } from "@/lib/idiomas";

export default function Estudar() {
  const { id } = useParams();
  const [baralho, setBaralho] = useState(undefined);
  const [fila, setFila] = useState([]);
  const [total, setTotal] = useState(0);
  const [feitas, setFeitas] = useState(0);
  const [virada, setVirada] = useState(false);
  const [placar, setPlacar] = useState({ nao: 0, acho: 0, decorei: 0 });

  useEffect(() => {
    const b = obterBaralho(id);
    setBaralho(b);
    if (b) {
      const f = montarFila(b.cartas);
      setFila(f);
      setTotal(f.length);
    }
  }, [id]);

  // Atalhos de teclado: espaço vira a carta; 1, 2, 3 respondem
  useEffect(() => {
    function tecla(e) {
      if (!fila.length) return;
      if (!virada && e.code === "Space") { e.preventDefault(); setVirada(true); }
      if (virada && ["1", "2", "3"].includes(e.key)) avaliar(["nao", "acho", "decorei"][Number(e.key) - 1]);
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  if (baralho === undefined) return null;
  if (baralho === null) return <p>Baralho não encontrado. <Link href="/">Voltar</Link></p>;

  const cfg = IDIOMAS[baralho.idioma];
  const voltar = `/baralho/${baralho.id}`;

  function avaliar(resposta) {
    const cartaId = fila[0];
    const atualizada = responder(baralho.cartas.find((c) => c.id === cartaId), resposta);
    const novo = { ...baralho, cartas: baralho.cartas.map((c) => (c.id === cartaId ? atualizada : c)) };
    salvarBaralho(novo); // salva a cada resposta: fechar a aba não perde progresso
    setBaralho(novo);
    setPlacar((p) => ({ ...p, [resposta]: p[resposta] + 1 }));
    // "Não sei" manda a carta para o fim da fila desta sessão
    setFila((f) => (resposta === "nao" ? [...f.slice(1), cartaId] : f.slice(1)));
    if (resposta !== "nao") setFeitas((n) => n + 1);
    setVirada(false);
  }

  // Fim da sessão (ou nada para revisar)
  if (fila.length === 0) {
    return (
      <div style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
        <h1>{total ? "Sessão concluída" : "Nada para revisar agora"}</h1>
        <p className="mu" style={{ margin: "8px 0 28px" }}>
          {total
            ? `Decorei ${placar.decorei} · Acho que sei ${placar.acho} · Não sei ${placar.nao}`
            : "Todas as cartas deste baralho estão agendadas para outro dia."}
        </p>
        <Link href={voltar} className="btn">Voltar ao baralho</Link>
      </div>
    );
  }

  const carta = baralho.cartas.find((c) => c.id === fila[0]);
  const pct = total ? Math.round((feitas / total) * 100) : 0;

  return (
    <div className="estudo">
      <div className="estudo-topo">
        <Link href={voltar} className="mu">← Sair</Link>
        <span className="mu">{cfg.nome} · {baralho.tema}</span>
        <div className="bar" style={{ flex: 1, marginTop: 0 }}><div style={{ width: `${pct}%` }} /></div>
        <span className="mu">{feitas} / {total}</span>
      </div>

      <div className="flash">
        {!virada ? (
          <div className="frente">
            <span className="rotulo">Pergunta</span>
            <span className="z grande">{carta.palavra}</span>
          </div>
        ) : (
          <>
            <div className="verso-topo">
              <span className="rotulo">Resposta</span>
              <span className="z" style={{ fontSize: 22 }}>{carta.palavra}</span>
            </div>
            <p className="d leitura">{carta.leitura}</p>
            <p className="traducao">{carta.traducao} <span className="tg">{carta.classe}</span></p>
            <div className="exemplo">
              <p className="z" style={{ fontSize: 20, margin: 0 }}>{carta.exemplo}</p>
              <p className="mu" style={{ margin: "4px 0 0" }}>{carta.exemploLeitura}</p>
              <p className="mu" style={{ margin: "4px 0 0" }}>{carta.exemploTraducao}</p>
            </div>
          </>
        )}
      </div>

      <div style={{ textAlign: "center" }}>
        {!virada ? (
          <button className="btn" onClick={() => setVirada(true)}>Mostrar resposta <span className="mu" style={{ color: "#bbb" }}>(espaço)</span></button>
        ) : (
          <>
            <p className="mu">Como foi lembrar?</p>
            <div className="acoes" style={{ justifyContent: "center" }}>
              <button className="bo" onClick={() => avaliar("nao")}>{RESPOSTAS.nao}</button>
              <button className="bo" style={{ background: "#DCE8FD" }} onClick={() => avaliar("acho")}>{RESPOSTAS.acho}</button>
              <button className="btn" onClick={() => avaliar("decorei")}>{RESPOSTAS.decorei}</button>
            </div>
            <p className="mu" style={{ fontSize: 12 }}>Atalhos: 1, 2, 3</p>
          </>
        )}
      </div>
    </div>
  );
}
