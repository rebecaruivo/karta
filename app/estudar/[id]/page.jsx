"use client";
// v2 · Sessão de estudo: todas as cartas disponíveis, embaralhadas + FSRS
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { obterRepo } from "@/lib/v2/cliente";
import { montarFila, espacarPalavras } from "@/lib/v2/sessao";
import { responder, RESPOSTAS } from "@/lib/v2/srs";
import Carta from "@/components/v2/Carta";
import { registrarEvento } from "@/lib/v2/eventos";

export default function EstudarV2() {
  const { id } = useParams();
  const [dados, setDados] = useState(undefined);
  const [fila, setFila] = useState([]);
  const [total, setTotal] = useState(0);
  // Progresso = cartas já vistas nesta sessão. Cada carta sai da fila ao ser respondida,
  // então a barra chega a 100% e a sessão termina em vez de repetir cartas sem fim.
  const [vistas, setVistas] = useState(() => new Set());
  const [virada, setVirada] = useState(false);
  // Carta marcada como "Difícil" volta UMA vez no fim da sessão (decisão de 18/11);
  // as outras saem ao serem respondidas, para a sessão terminar.
  const [voltaram, setVoltaram] = useState(() => new Set());
  const inicioCarta = useRef(Date.now());

  useEffect(() => {
    obterRepo().then((r) => r.carregarBaralho(id)).then((d) => {
      setDados(d);
      if (!d) return;
      // ?conceitos=a,b,c vem do "Estudar só essas" (aba Progresso): só essas palavras, mesmo antes da data
      const conceitos = new URLSearchParams(window.location.search).get("conceitos")?.split(",").filter(Boolean) || null;
      const f = montarFila(d.cartas, { conceitos });
      setFila(f); setTotal(f.length);
      if (f.length) registrarEvento("sessao_iniciada", { deck_id: id, idioma: d.deck.target_language });
    });
  }, [id]);

  async function avaliar(resposta) {
    const carta = fila[0];
    registrarEvento("carta_respondida", {
      deck_id: id,
      card_id: carta.id,
      concept_id: carta.concept_id,
      rating: resposta,
      duracao_ms: Date.now() - inicioCarta.current,
      idioma: dados.deck.target_language,
    });
    const nova = responder(carta, resposta);
    const repo = await obterRepo();
    await repo.atualizarCarta(nova);
    // Registro da resposta, para a aba "Progresso" (cartas por dia, pontos fracos). Se falhar, o estudo segue.
    repo.registrarRevisao({ carta, rating: resposta, duracao_ms: Date.now() - inicioCarta.current }).catch(() => {});
    const volta = resposta === "nao" && !voltaram.has(carta.id);
    if (volta) setVoltaram((v) => new Set(v).add(carta.id));
    // A carta respondida fica como "cabeça" só para a próxima não ser da mesma palavra
    setFila((f) => espacarPalavras([carta, ...f.slice(1), ...(volta ? [nova] : [])]).slice(1));
    setVistas((v) => new Set(v).add(carta.id));
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

  const cabeca = fila[0]?.id;
  useEffect(() => { inicioCarta.current = Date.now(); }, [cabeca]);

  if (dados === undefined) return null;
  if (dados === null) return <p>Baralho não encontrado. <Link href="/">Voltar</Link></p>;
  const voltar = `/baralho/${id}`;

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
  const pct = total ? Math.round((vistas.size / total) * 100) : 0;
  const revendo = fila.filter((c) => vistas.has(c.id)).length;


  return (
    <div className="estudo">
      <div className="estudo-topo">
        <Link href={voltar} className="mu">← Sair</Link>
        <span className="mu estudo-nome">{dados.deck.name}</span>
        <div className="bar" style={{ flex: 1, marginTop: 0 }}><div style={{ width: `${pct}%` }} /></div>
        <span className="mu v2-contador" title="Cartas vistas nesta sessão">{vistas.size} / {total}{revendo > 0 && ` · ${revendo} para rever`}</span>
      </div>

      <Carta key={carta.id + carta.reps} ponte={carta.bridge_template_id} palavra={palavra} virada={virada} aoVirar={() => setVirada((v) => !v)}
        comAudio={(dados.deck.facetas_opcionais ?? ["AUDIO"]).includes("AUDIO")} />

      {/* Mesmo padrão da v1: botões simples e os atalhos numa linha discreta embaixo */}
      <div className="v2-botoes">
        {!virada ? (
          <button className="btn" onClick={() => setVirada(true)}>Mostrar resposta</button>
        ) : (
          <>
            <button className="bo" onClick={() => avaliar("nao")}>{RESPOSTAS.nao.rotulo}</button>
            <button className="bo" style={{ background: "#DCE8FD" }} onClick={() => avaliar("acho")}>{RESPOSTAS.acho.rotulo}</button>
            <button className="btn" onClick={() => avaliar("decorei")}>{RESPOSTAS.decorei.rotulo}</button>
          </>
        )}
      </div>
      <p className="mu v2-atalhos">{virada ? "Atalhos: 1, 2, 3 · espaço vira a carta" : "Atalho: espaço vira a carta"}</p>
    </div>
  );
}
