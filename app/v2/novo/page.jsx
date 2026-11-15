"use client";
// v2 · Novo baralho (página própria)
// Modo A (seção 4): tema → Módulo 1 sugere palavras → você revisa → Módulos 2 e 3
// Modo B (seção 3): você digita as palavras → Módulos 2 e 3
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { lerPalavras, validarTema, LIMITES } from "@/lib/v2/portaEntrada";
import { obterRepo } from "@/lib/v2/cliente";
import { cabecalhosComChave } from "@/lib/chave";

const NIVEIS = ["HSK 1", "HSK 2", "HSK 3", "HSK 4", "HSK 5", "HSK 6"];
const MAIS_POR_VEZ = 5;

export default function NovoBaralhoV2() {
  const router = useRouter();
  const [modo, setModo] = useState("tema"); // "tema" (A) | "palavras" (B)
  const [nome, setNome] = useState("");
  const [nivel, setNivel] = useState("HSK 1");
  const [comAudio, setComAudio] = useState(true);
  const cartasPorPalavra = comAudio ? 7 : 3;
  const [etapa, setEtapa] = useState(null); // mensagem de progresso
  const [erro, setErro] = useState(null);

  // Modo B
  const [texto, setTexto] = useState("");
  // Modo A
  const [tema, setTema] = useState("");
  const [quantidade, setQuantidade] = useState(10);
  const [revisao, setRevisao] = useState(null); // palavras sugeridas, em revisão: [{ chave, gloss, lemma, sense_hint, origin }]
  const [refinar, setRefinar] = useState(null);  // sugestão da IA quando o tema é vago
  const [novaPalavra, setNovaPalavra] = useState("");
  const [descartadas, setDescartadas] = useState(0);

  // Prévia das palavras reconhecidas (chips), antes de gastar IA (seção 3.2)
  const previa = modo === "palavras" && texto.trim() ? lerPalavras(texto, { target_language: "zh", level: nivel }) : null;
  const temaValido = validarTema(tema);

  // Palavra sugerida pela IA, com o resultado da checagem no HSK
  const daIA = (w) => ({ chave: crypto.randomUUID(), gloss: w.gloss, lemma: w.lemma, sense_hint: null, origin: "ai", hsk: w.hsk ?? null, acima: Boolean(w.acima_do_nivel), descartado: w.lemma_descartado ?? null });

  function trocarModo(m) { setModo(m); setErro(null); setRefinar(null); }

  // ── Modo A: pede palavras ao Módulo 1 ─────────────────────────
  async function pedirPalavras({ count, existentes = [] }) {
    const resp = await fetch("/api/v2/palavras", {
      method: "POST", headers: cabecalhosComChave(),
      body: JSON.stringify({ theme: temaValido.tema, level: nivel, count, existing_words: existentes }),
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || "Falha ao gerar as palavras.");
    return dados;
  }

  async function gerarPalavras(e) {
    e.preventDefault();
    if (temaValido.erro) return setErro(temaValido.erro);
    setErro(null); setRefinar(null); setEtapa("Módulo 1: escolhendo palavras para o tema…");
    try {
      const dados = await pedirPalavras({ count: quantidade });
      if (dados.refinar) { setRefinar(dados.refinar); return; }
      setRevisao(dados.wordList.words.map(daIA));
      setDescartadas(dados.descartadas?.length || 0);
      if (!nome.trim()) setNome(temaValido.tema);
    } catch (err) { setErro(err.message); } finally { setEtapa(null); }
  }

  // "Pedir mais": manda as palavras que já estão na lista, para a IA não repetir
  async function pedirMais() {
    setErro(null); setEtapa("Módulo 1: buscando mais palavras…");
    try {
      const existentes = revisao.map((p) => p.lemma).filter(Boolean);
      const dados = await pedirPalavras({ count: MAIS_POR_VEZ, existentes });
      if (dados.refinar) { setRefinar(dados.refinar); return; }
      const glosses = new Set(revisao.map((p) => p.gloss.toLowerCase()));
      const novas = dados.wordList.words.filter((w) => !glosses.has(w.gloss.toLowerCase()))
        .map(daIA);
      if (!novas.length) setErro("A IA não encontrou palavras novas para esse tema.");
      setRevisao([...revisao, ...novas]);
    } catch (err) { setErro(err.message); } finally { setEtapa(null); }
  }

  // Editar descarta a palavra em mandarim: o Módulo 2 traduz o texto novo
  function editar(chave, gloss) {
    setRevisao(revisao.map((p) => (p.chave === chave ? { ...p, gloss, lemma: null, origin: "user", hsk: null, acima: false, descartado: null } : p)));
  }
  function remover(chave) { setRevisao(revisao.filter((p) => p.chave !== chave)); }

  // Acrescentar usa a mesma porta de entrada do modo B (aceita "banco (dinheiro)" e várias por vírgula)
  function acrescentar(e) {
    e.preventDefault();
    const lidas = lerPalavras(novaPalavra, { target_language: "zh", level: nivel }).wordList?.words || [];
    const glosses = new Set(revisao.map((p) => p.gloss.toLowerCase()));
    const novas = lidas.filter((w) => !glosses.has(w.gloss.toLowerCase()))
      .map((w) => ({ chave: crypto.randomUUID(), gloss: w.gloss, lemma: null, sense_hint: w.sense_hint, origin: "user" }));
    setRevisao([...revisao, ...novas].slice(0, LIMITES.maxPalavras));
    setNovaPalavra("");
  }

  const revisaoValida = revisao?.filter((p) => p.gloss.trim()) || [];
  const wordListRevisada = revisaoValida.length ? {
    origin: "theme", theme: temaValido.tema, target_language: "zh", level: nivel,
    words: revisaoValida.map((p, i) => ({ id: `w${i + 1}`, gloss: p.gloss.trim(), lemma: p.lemma, sense_hint: p.sense_hint, origin: p.origin })),
  } : null;

  // ── Módulos 2 e 3: igual para os dois modos ───────────────────
  async function criarBaralho(wordList, { creation_mode, theme = null }) {
    setErro(null);
    try {
      const repo = await obterRepo();
      setEtapa("Criando o baralho…");
      const deck = await repo.criarBaralho({ name: nome.trim() || theme || "Meu baralho", creation_mode, theme, target_language: "zh", level: nivel, facetas_opcionais: comAudio ? ["AUDIO"] : [] });
      await repo.atualizarBaralho({ ...deck, pipeline_status: "facets_in_progress" });

      setEtapa(`Módulo 2: gerando as facetas de ${wordList.words.length} palavras…`);
      const resp = await fetch("/api/v2/enriquecer", { method: "POST", headers: cabecalhosComChave(), body: JSON.stringify({ wordList }) });
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

  const caixaAudio = (
    <label className="aviso" style={{ display: "flex", gap: 12, cursor: "pointer" }}>
      <input type="checkbox" checked={comAudio} onChange={(e) => setComAudio(e.target.checked)} style={{ marginTop: 4 }} />
      <span><strong>Incluir exercícios de áudio</strong><br />
        <span className="mu">{comAudio ? "7 cartas por palavra, incluindo as de escuta e pronúncia." : "3 cartas por palavra (palavra, frase e lacuna), sem exercícios de escuta."}</span></span>
    </label>
  );
  const seletorNivel = (
    <div>
      <span className="lb">Nível</span>
      <div className="chips">{NIVEIS.map((n) => <button type="button" key={n} className={`ch ${nivel === n ? "on" : ""}`} onClick={() => setNivel(n)} disabled={Boolean(revisao)}>{n}</button>)}</div>
    </div>
  );
  const campoNome = (
    <div>
      <label className="lb" htmlFor="nome">Nome do baralho</label>
      <input id="nome" className="fi" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={modo === "tema" ? "Se vazio, usa o tema" : "Ex.: Comida"} maxLength={60} />
    </div>
  );
  const caixaErro = erro && <div className="erro">{erro}{erro.includes("chave") && <> · <Link href="/configuracoes" style={{ textDecoration: "underline" }}>Configurações</Link></>}</div>;

  return (
    <>
      <Link href="/v2" className="mu">← Baralhos da v2</Link>
      <h1 style={{ margin: "12px 0 8px" }}>Novo baralho</h1>
      <p className="mu" style={{ marginBottom: 20 }}>Cada palavra vira até 7 cartas, uma para cada conexão. Nesta versão, só mandarim.</p>
      <div className="chips" style={{ marginBottom: 16 }}>
        <button type="button" className={`ch ${modo === "tema" ? "on" : ""}`} onClick={() => trocarModo("tema")} disabled={Boolean(etapa)}>Gerar a partir de um tema</button>
        <button type="button" className={`ch ${modo === "palavras" ? "on" : ""}`} onClick={() => trocarModo("palavras")} disabled={Boolean(etapa)}>Inserir minhas palavras</button>
      </div>

      {/* ── MODO A, passo 1: tema ── */}
      {modo === "tema" && !revisao && (
        <form className="form" onSubmit={gerarPalavras}>
          <div>
            <label className="lb" htmlFor="tema">Tema</label>
            <input id="tema" className="fi" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex.: frutas, no restaurante, partes do corpo" maxLength={LIMITES.maxTema} />
            {refinar && <div className="aviso" style={{ marginTop: 10 }}><strong>Esse tema ficou amplo demais.</strong> {refinar}</div>}
          </div>
          <div>
            <label className="lb" htmlFor="qtd">Quantas palavras</label>
            <input id="qtd" className="fi" type="number" min={LIMITES.minPalavras} max={LIMITES.maxPalavras} value={quantidade}
              onChange={(e) => setQuantidade(Math.max(LIMITES.minPalavras, Math.min(LIMITES.maxPalavras, Number(e.target.value) || 1)))} style={{ maxWidth: 120 }} />
          </div>
          {seletorNivel}
          {caixaErro}
          {etapa ? <div className="aviso">{etapa}</div> : (
            <div><button className="btn" type="submit" disabled={Boolean(temaValido.erro)}>Sugerir palavras</button></div>
          )}
          <p className="mu" style={{ fontSize: 13, margin: 0 }}>Você revisa a lista antes de qualquer carta ser criada.</p>
        </form>
      )}

      {/* ── MODO A, passo 2: revisão ── */}
      {modo === "tema" && revisao && (
        <div className="form">
          <div>
            <span className="lb">Palavras sugeridas para “{temaValido.tema}” · {nivel}</span>
            <p className="mu" style={{ fontSize: 13, margin: "0 0 10px" }}>
              Edite, remova ou acrescente. Palavra editada ou acrescentada é traduzida de novo na próxima etapa.
              {descartadas > 0 && ` (${descartadas} sugestão(ões) repetida(s) ou inválida(s) foram descartadas.)`}
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {revisao.map((p) => (
                <div key={p.chave} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="z" style={{ minWidth: 56, fontSize: 20 }} title={p.descartado ? `A IA escreveu ${p.descartado}, que não está na lista do HSK; será traduzida de novo` : p.lemma ? "Escolhida pela IA" : "Será traduzida na próxima etapa"}>{p.lemma || "…"}</span>
                  <input className="fi v2-fi" value={p.gloss} onChange={(e) => editar(p.chave, e.target.value)} aria-label="Palavra em português" maxLength={LIMITES.maxCaracteres} disabled={Boolean(etapa)} />
                  {p.origin === "user" && <span className="tg">sua</span>}
                  {p.acima && <span className="tg" title={`Acima do ${nivel}`}>{p.hsk === 7 ? "HSK 6+" : `HSK ${p.hsk}`}</span>}
                  <button type="button" className="v2-link" onClick={() => remover(p.chave)} aria-label={`Remover ${p.gloss}`} disabled={Boolean(etapa)}>remover</button>
                </div>
              ))}
            </div>
          </div>
          <form onSubmit={acrescentar} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input className="fi v2-fi" value={novaPalavra} onChange={(e) => setNovaPalavra(e.target.value)} placeholder="Acrescentar: laranja, banco (dinheiro)" disabled={Boolean(etapa)} />
            <button type="submit" className="bo v2-bo-p" disabled={!novaPalavra.trim() || Boolean(etapa)}>Adicionar</button>
          </form>
          <div><button type="button" className="v2-link" onClick={pedirMais} disabled={Boolean(etapa) || revisao.length >= LIMITES.maxPalavras}>+ Pedir mais {MAIS_POR_VEZ} à IA</button></div>
          {campoNome}
          {caixaAudio}
          {caixaErro}
          {etapa ? <div className="aviso">{etapa}</div> : (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="btn" type="button" disabled={!wordListRevisada} onClick={() => criarBaralho(wordListRevisada, { creation_mode: "theme", theme: temaValido.tema })}>
                Criar baralho{wordListRevisada ? ` (${wordListRevisada.words.length} palavras · até ${wordListRevisada.words.length * cartasPorPalavra} cartas)` : ""}
              </button>
              <button type="button" className="v2-link" onClick={() => { setRevisao(null); setErro(null); }}>Voltar ao tema</button>
            </div>
          )}
        </div>
      )}

      {/* ── MODO B ── */}
      {modo === "palavras" && (
        <form className="form" onSubmit={(e) => { e.preventDefault(); if (previa?.wordList) criarBaralho(previa.wordList, { creation_mode: "words" }); }}>
          {campoNome}
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
          {seletorNivel}
          {caixaAudio}
          {caixaErro}
          {etapa ? <div className="aviso">{etapa}</div> : (
            <div><button className="btn" type="submit" disabled={!previa?.wordList}>
              Criar baralho{previa?.wordList ? ` (${previa.wordList.words.length} palavras · até ${previa.wordList.words.length * cartasPorPalavra} cartas)` : ""}
            </button></div>
          )}
        </form>
      )}
    </>
  );
}
