"use client";
// v2 · Sessão de estudo: todas as cartas disponíveis, embaralhadas + FSRS
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { obterRepo } from "@/lib/v2/cliente";
import { montarFila } from "@/lib/v2/sessao";
import { responder, previsao, formatarIntervalo, RESPOSTAS } from "@/lib/v2/srs";
import Carta from "@/components/v2/Carta";

const VOLTA_NA_SESSAO_MS = 20 * 60 * 1000; // carta que volta em até 20 min reaparece nesta sessão

export default function EstudarV2() {
  const { id } = useParams();
  const [dados, setDados] = useState(undefined);
  const [fila, setFila] = useState([]);
  const [total, setTotal] = useState(0);
  const [feitas, setFeitas] = useState(0);
  const [virada, setVirada] = useState(false);

  useEffect(() => {
    obterRepo().then((r) => r.carregarBaralho(id)).then((d) => {
      setDados(d);
      if (!d) return;
      const f = montarFila(d.cartas);
      setFila(f); setTotal(f.length);
    });
  }, [id]);

  async function avaliar(resposta) {
    const carta = fila[0];
    const nova = responder(carta, resposta);
    await (await obterRepo()).atualizarCarta(nova);
    const voltaLogo = new Date(nova.due_at) - new Date() <= VOLTA_NA_SESSAO_MS;
    setFila((f) => (voltaLogo ? [...f.slice(1), nova] : f.slice(1)));
    if (!voltaLogo) setFeitas((n) => n + 1);
    setVirada(false);
  }

  // Atalhos: espaço vira; 1, 2, 3 respondem
  useEffect(() => {
    function tecla(e) {
      if (!fila.length) return;
      if (e.code === "Space") { e.preventDefault(); setVirada((v) => !v); }
      if (virada && ["1", "2", "3"].includes(e.key)) avaliar(["nao", "acho", "decorei"][Number(e.key) - 1]);
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  if (dados === undefined) return null;
  if (dados === null) return <p>Baralho não encontrado. <Link href="/v2">Voltar</Link></p>;
  const voltar = `/v2/baralho/${id}`;

  if (!fila.length) {
    return (
      <div style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
        <h1>{total ? "Sessão concluída" : "Nada para revisar agora"}</h1>
        <p className="mu" style={{ margin: "8px 0 28px" }}>
          {total ? "As próximas revisões aparecem quando chegar a hora de cada carta." : "Todas as cartas estão agendadas para mais tarde."}
        </p>
        <Link href={voltar} className="btn">Voltar ao baralho</Link>
      </div>
    );
  }

  const carta = fila[0];
  const palavra = dados.palavras.find((p) => p.concept.id === carta.concept_id);
  const prev = previsao(carta);
  const pct = total ? Math.round((feitas / total) * 100) : 0;

  return (
    <div className="estudo">
      <div className="estudo-topo">
        <Link href={voltar} className="mu">← Sair</Link>
        <span className="mu">{dados.deck.name}</span>
        <div className="bar" style={{ flex: 1, marginTop: 0 }}><div style={{ width: `${pct}%` }} /></div>
        <span className="mu">{feitas} / {total}</span>
      </div>

      <Carta key={carta.id + carta.reps} ponte={carta.bridge_template_id} palavra={palavra} virada={virada} aoVirar={() => setVirada((v) => !v)}
        comAudio={(dados.deck.facetas_opcionais ?? ["AUDIO"]).includes("AUDIO")} />

      <div className="v2-botoes" style={{ minHeight: 90 }}>
        {!virada ? (
          <button className="btn" onClick={() => setVirada(true)}>Mostrar resposta <span className="mu" style={{ color: "#bbb" }}>(espaço)</span></button>
        ) : (
          ["nao", "acho", "decorei"].map((r, i) => (
            <button key={r} className={`${r === "decorei" ? "btn" : "bo"} v2-resp`} onClick={() => avaliar(r)}>
              {RESPOSTAS[r].rotulo}<small>{formatarIntervalo(prev[r])} · {i + 1}</small>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
