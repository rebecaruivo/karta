"use client";
// Aba "Progresso": métricas pessoais de estudo. Só aparecem aqui, para quem procurar;
// o resto do app continua sem números. A análise com IA só roda quando a pessoa pede.
import "./progresso.css";
import { useEffect, useState } from "react";
import Link from "next/link";
import { obterRepo } from "@/lib/v2/cliente";
import { calcularProgresso, resumoParaIA } from "@/lib/v2/progresso";
import { MINIMO_RESPOSTAS, NOMES_CARTAS } from "@/lib/v2/analise";
import { idiomaV2 } from "@/lib/v2/idiomas";
import { cabecalhosComChave } from "@/lib/chave";
import { registrarEvento } from "@/lib/v2/eventos";

// Escala de um tom (do claro ao escuro), validada para daltonismo: nova → aprendendo → firme
const ETAPAS = [
  { chave: "novas", rotulo: "Novas", cor: "#93ADF1" },
  { chave: "aprendendo", rotulo: "Aprendendo", cor: "#5279E0" },
  { chave: "firmes", rotulo: "Firmes", cor: "#2246BE" },
];
const BARRA = "#2246BE";
const fmtDia = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaDaSemana = (d) => SEMANA[new Date(`${d}T12:00:00`).getDay()];

function Numero({ titulo, valor, nota }) {
  return (
    <div className="pg-num">
      <div className="mu pg-num-t">{titulo}</div>
      <div className="pg-num-v">{valor}</div>
      {nota && <div className="mu pg-num-n">{nota}</div>}
    </div>
  );
}

// Barras verticais de uma série só (sem legenda: o título diz o que é), com dica ao passar o mouse ou focar
function Barras({ serie, rotulo, dica, titulo }) {
  const [foco, setFoco] = useState(null);
  const max = Math.max(1, ...serie.map((d) => d.total));
  return (
    <figure className="pg-fig" aria-label={titulo}>
      <div className="pg-barras" onMouseLeave={() => setFoco(null)}>
        {serie.map((d, i) => (
          <div key={d.dia} className="pg-col" tabIndex={0} aria-label={dica(d)}
            onMouseEnter={() => setFoco(i)} onFocus={() => setFoco(i)} onBlur={() => setFoco(null)}>
            {foco === i && <div className="pg-dica" role="tooltip">{dica(d)}</div>}
            <div className="pg-barra" style={{ height: `${(d.total / max) * 100}%`, background: BARRA, opacity: foco === null || foco === i ? 1 : 0.55 }} />
          </div>
        ))}
      </div>
      <div className="pg-eixo" aria-hidden="true">{serie.map((d, i) => <span key={d.dia}>{rotulo(d, i)}</span>)}</div>
      <details className="pg-tabela"><summary className="mu">Ver os números</summary>
        <table><tbody>{serie.map((d) => <tr key={d.dia}><td>{dica(d)}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

// Uma barra segmentada por baralho: novas, aprendendo, firmes (2px de espaço entre os pedaços)
function Dominio({ baralhos }) {
  return (
    <figure className="pg-fig" aria-label="Domínio por baralho">
      <div className="pg-legenda">{ETAPAS.map((e) => <span key={e.chave}><i style={{ background: e.cor }} />{e.rotulo}</span>)}</div>
      <div style={{ display: "grid", gap: 14 }}>
        {baralhos.map((b) => (
          <div key={b.deck_id}>
            <div className="pg-dom-cab"><Link href={`/baralho/${b.deck_id}`}>{b.nome}</Link><span className="mu">{b.firmes} de {b.total} cartas firmes</span></div>
            <div className="pg-seg" role="img" aria-label={`${b.nome}: ${b.novas} novas, ${b.aprendendo} aprendendo, ${b.firmes} firmes`}>
              {ETAPAS.filter((e) => b[e.chave] > 0).map((e) => (
                <div key={e.chave} title={`${e.rotulo}: ${b[e.chave]}`} style={{ flex: b[e.chave], background: e.cor }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <details className="pg-tabela"><summary className="mu">Ver os números</summary>
        <table><thead><tr><th>Baralho</th>{ETAPAS.map((e) => <th key={e.chave}>{e.rotulo}</th>)}</tr></thead>
          <tbody>{baralhos.map((b) => <tr key={b.deck_id}><td>{b.nome}</td>{ETAPAS.map((e) => <td key={e.chave}>{b[e.chave]}</td>)}</tr>)}</tbody></table>
      </details>
    </figure>
  );
}

function Analise({ progresso, decks }) {
  const [estado, setEstado] = useState(null); // null | "carregando" | resultado | { erro }
  const faltam = MINIMO_RESPOSTAS - progresso.respostas.total;
  async function analisar() {
    setEstado("carregando");
    const idiomas = [...new Set(decks.map((d) => idiomaV2(d.target_language).nome))];
    try {
      const resp = await fetch("/api/v2/analise", { method: "POST", headers: cabecalhosComChave(), body: JSON.stringify({ resumo: resumoParaIA(progresso, { idiomas }) }) });
      const dados = await resp.json();
      setEstado(resp.ok ? dados : { erro: dados.erro || "Não consegui analisar agora." });
      if (resp.ok && dados.custo) registrarEvento("analise_gerada", { payload: { custo_usd: dados.custo.usd, tokens: dados.custo.tokens, custo_estimado: dados.custo.estimado, modelo: dados.custo.modelo } });
    } catch { setEstado({ erro: "Não consegui analisar agora." }); }
  }
  if (faltam > 0) return <p className="mu">A análise com IA aparece depois de {MINIMO_RESPOSTAS} cartas respondidas nos últimos 30 dias (faltam {faltam}).</p>;
  if (!estado) return (
    <div>
      <p className="mu" style={{ marginTop: 0 }}>O Gemini lê só os números e as palavras difíceis (nada que identifique você) e aponta padrões e o que praticar. Usa a sua chave do Gemini.</p>
      <button className="bo" onClick={analisar}>Analisar meu progresso</button>
    </div>
  );
  if (estado === "carregando") return <p className="mu">Analisando…</p>;
  if (estado.erro) return <p className="erro">{estado.erro} <button className="v2-link" onClick={analisar}>Tentar de novo</button></p>;
  return (
    <div className="aviso" style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0 }}>{estado.resumo}</p>
      {estado.padroes.length > 0 && <div><strong>O que os números mostram</strong><ul>{estado.padroes.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      {estado.sugestoes.length > 0 && <div><strong>O que praticar</strong><ul>{estado.sugestoes.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      <p className="mu" style={{ margin: 0, fontSize: 12 }}>Análise gerada por IA ({estado.modelo}) a partir das suas estatísticas dos últimos 30 dias. <button className="v2-link" style={{ fontSize: 12 }} onClick={analisar}>Gerar de novo</button></p>
    </div>
  );
}

export default function Progresso() {
  const [dados, setDados] = useState(undefined);
  useEffect(() => {
    obterRepo().then((r) => r.carregarProgresso())
      .then((d) => setDados({ ...d, progresso: calcularProgresso(d) }))
      .catch(() => setDados(null));
  }, []);

  if (dados === undefined) return null;
  if (dados === null) return <p className="erro">Não consegui carregar o seu progresso agora.</p>;
  const { progresso: p, decks } = dados;

  if (!p.temDados) return (
    <div className="v2">
      <h1>Meu progresso</h1>
      <p className="mu">Ainda não há o que mostrar. <Link href="/novo" style={{ textDecoration: "underline" }}>Crie um baralho</Link> e estude algumas cartas: o progresso aparece aqui.</p>
    </div>
  );

  const hoje = p.porDia.at(-1);
  // Pontos fracos agrupados por baralho, para "Estudar só essas" abrir a sessão certa
  const fracosPorBaralho = Object.entries(p.pontosFracos.reduce((g, f) => ((g[f.deck_id] ??= []).push(f), g), {}));
  const nomeDe = (id) => decks.find((d) => d.id === id)?.name ?? "Baralho";
  const ultimo = p.porDia.length - 1;

  return (
    <div className="v2 pg">
      <h1>Meu progresso</h1>
      <p className="mu" style={{ marginBottom: 28 }}>Só você vê estes números. Os dias são contados no seu fuso; “firme” é a carta com memória de 21 dias ou mais.</p>

      <div className="pg-nums">
        <Numero titulo="Dias seguidos" valor={p.sequencia.atual} nota={p.sequencia.estudouHoje ? "contando hoje" : p.sequencia.atual ? "estude hoje para continuar" : "comece hoje"} />
        <Numero titulo="Cartas hoje" valor={hoje.total} />
        <Numero titulo="Para revisar hoje" valor={p.previsao[0].total} />
        <Numero titulo="Respostas “Fácil”" valor={p.respostas.pctDecorei === null ? "—" : `${p.respostas.pctDecorei}%`}
          nota={p.respostas.total ? `${p.respostas.pctNao}% “Difícil” · ${p.respostas.total} respostas em 30 dias` : "sem respostas em 30 dias"} />
      </div>

      <section className="pg-sec">
        <h2>Cartas respondidas por dia</h2>
        <Barras titulo="Cartas respondidas por dia, últimos 14 dias" serie={p.porDia}
          rotulo={(d, i) => ((ultimo - i) % 2 === 0 ? fmtDia(d.dia) : "")}
          dica={(d) => `${fmtDia(d.dia)}: ${d.total} carta(s)${d.total ? ` (${d.nao} Difícil, ${d.acho} Médio, ${d.decorei} Fácil)` : ""}`} />
      </section>

      <section className="pg-sec">
        <h2>Revisões dos próximos 7 dias</h2>
        <Barras titulo="Revisões previstas, próximos 7 dias" serie={p.previsao}
          rotulo={(d, i) => (i === 0 ? "hoje" : diaDaSemana(d.dia))}
          dica={(d) => `${fmtDia(d.dia)}: ${d.total} revisão(ões)`} />
      </section>

      {p.dominio.length > 0 && <section className="pg-sec"><h2>Domínio por baralho</h2><Dominio baralhos={p.dominio} /></section>}

      <section className="pg-sec">
        <h2>Pontos fracos</h2>
        {p.pontosFracos.length === 0 ? <p className="mu">Nenhuma palavra recebeu “Difícil” várias vezes nos últimos 30 dias.</p> : (
          <div style={{ display: "grid", gap: 20 }}>
            {fracosPorBaralho.map(([deckId, lista]) => (
              <div key={deckId}>
                <div className="pg-dom-cab"><strong>{nomeDe(deckId)}</strong>
                  <Link className="v2-link" href={`/estudar/${deckId}?conceitos=${lista.map((f) => f.concept_id).join(",")}`}>Estudar só essas</Link></div>
                <ul className="pg-fracos">
                  {lista.map((f) => (
                    <li key={f.concept_id}>
                      <span className="pg-fraco-pal">{f.palavra}</span> <span className="mu">({f.significado})</span>
                      <span className="mu"> · “Difícil” {f.dificeis} de {f.total}{f.ponteMaisDificil ? ` · mais na carta ${NOMES_CARTAS[f.ponteMaisDificil] ?? ""}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="pg-sec">
        <h2>Análise com IA</h2>
        <Analise progresso={p} decks={decks} />
      </section>
    </div>
  );
}
