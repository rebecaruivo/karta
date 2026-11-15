"use client";
// v2 · Baralhos e criação por lista de palavras (modo B, seção 3)
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { lerPalavras } from "@/lib/v2/portaEntrada";
import { obterRepo } from "@/lib/v2/cliente";
import { cabecalhosComChave } from "@/lib/chave";

const NIVEIS = ["HSK 1", "HSK 2", "HSK 3", "HSK 4", "HSK 5", "HSK 6"];

export default function BaralhosV2() {
  const router = useRouter();
  const [baralhos, setBaralhos] = useState(null);
  const [texto, setTexto] = useState("");
  const [nivel, setNivel] = useState("HSK 1");
  const [nome, setNome] = useState("");
  const [comAudio, setComAudio] = useState(true);
  const cartasPorPalavra = comAudio ? 7 : 3;
  const [etapa, setEtapa] = useState(null); // mensagem de progresso
  const [erro, setErro] = useState(null);

  useEffect(() => { obterRepo().then((r) => r.listarBaralhos()).then(setBaralhos); }, []);

  // Prévia das palavras reconhecidas (chips), antes de gastar IA (seção 3.2)
  const previa = texto.trim() ? lerPalavras(texto, { target_language: "zh", level: nivel }) : null;

  async function criar(e) {
    e.preventDefault();
    if (!previa?.wordList) return;
    setErro(null);
    try {
      const repo = await obterRepo();
      setEtapa("Criando o baralho…");
      const deck = await repo.criarBaralho({ name: nome.trim() || "Meu baralho", creation_mode: "words", target_language: "zh", level: nivel, facetas_opcionais: comAudio ? ["AUDIO"] : [] });
      await repo.atualizarBaralho({ ...deck, pipeline_status: "facets_in_progress" });

      setEtapa(`Módulo 2: gerando as facetas de ${previa.wordList.words.length} palavras…`);
      const resp = await fetch("/api/v2/enriquecer", { method: "POST", headers: cabecalhosComChave(), body: JSON.stringify({ wordList: previa.wordList }) });
      const dados = await resp.json();
      if (!resp.ok) {
        await repo.atualizarBaralho({ ...deck, pipeline_status: "failed" });
        throw new Error(dados.erro || "Falha ao gerar as facetas.");
      }

      setEtapa("Módulo 3: montando as cartas…");
      await repo.adicionarPalavras(deck.id, dados.resultados);
      await repo.atualizarBaralho({ ...deck, pipeline_status: "cards_ready", modelo: dados.modelo, versao_prompt: dados.versaoPrompt });
      router.push(`/v2/baralho/${deck.id}`);
    } catch (err) {
      setErro(err.message);
      setEtapa(null);
    }
  }

  return (
    <>
      <h1>Baralhos (v2)</h1>
      <p className="mu" style={{ marginBottom: 24 }}>Cada palavra vira até 7 cartas, uma para cada conexão. Nesta versão, só mandarim.</p>

      {baralhos?.length > 0 && (
        <div className="grade" style={{ marginBottom: 40 }}>
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

      <h2 className="d" style={{ fontSize: 22 }}>Novo baralho por palavras</h2>
      <form className="form" onSubmit={criar}>
        <div>
          <label className="lb" htmlFor="nome">Nome do baralho</label>
          <input id="nome" className="fi" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Comida" maxLength={60} />
        </div>
        <div>
          <label className="lb" htmlFor="palavras">Palavras em português, separadas por vírgula</label>
          <textarea id="palavras" className="fi" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder="água, arroz, banco (dinheiro), comer" />
          <p className="mu" style={{ fontSize: 13, margin: "6px 0 0" }}>Para escolher o sentido, use parênteses: banco (dinheiro).</p>
          {previa?.wordList && (
            <div className="chips" style={{ marginTop: 10 }}>
              {previa.wordList.words.map((w) => (
                <span key={w.id} className="ch" style={{ cursor: "default" }}>{w.gloss}{w.sense_hint ? <span className="mu"> · {w.sense_hint}</span> : null}</span>
              ))}
            </div>
          )}
          {previa?.avisos?.map((a) => <p key={a} className="mu" style={{ fontSize: 13, margin: "6px 0 0" }}>{a}</p>)}
        </div>
        <div>
          <span className="lb">Nível</span>
          <div className="chips">{NIVEIS.map((n) => <button type="button" key={n} className={`ch ${nivel === n ? "on" : ""}`} onClick={() => setNivel(n)}>{n}</button>)}</div>
        </div>
        <label className="aviso" style={{ display: "flex", gap: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={comAudio} onChange={(e) => setComAudio(e.target.checked)} style={{ marginTop: 4 }} />
          <span><strong>Incluir exercícios de áudio</strong><br />
            <span className="mu">{comAudio ? "7 cartas por palavra, incluindo as de escuta e pronúncia." : "3 cartas por palavra (palavra, frase e lacuna), sem exercícios de escuta."}</span></span>
        </label>
        {erro && <div className="erro">{erro}{erro.includes("chave") && <> · <Link href="/configuracoes" style={{ textDecoration: "underline" }}>Configurações</Link></>}</div>}
        {etapa ? <div className="aviso">{etapa}</div> : (
          <div><button className="btn" type="submit" disabled={!previa?.wordList}>
            Criar baralho{previa?.wordList ? ` (${previa.wordList.words.length} palavras · até ${previa.wordList.words.length * cartasPorPalavra} cartas)` : ""}
          </button></div>
        )}
      </form>
    </>
  );
}
