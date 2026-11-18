"use client";
// v2 · Novo baralho (página própria)
// Modo A (seção 4): tema → Módulo 1 sugere palavras → você revisa → Módulos 2 e 3
// Modo B (seção 3): você digita as palavras → Módulos 2 e 3
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { lerPalavras, validarTema, LIMITES } from "@/lib/v2/portaEntrada";
import { obterRepo } from "@/lib/v2/cliente";
import { registrarEvento } from "@/lib/v2/eventos";
import { cabecalhosComChave } from "@/lib/chave";
import { obterFacetasPadrao } from "@/lib/preferencias";
import { FACETAS_PADRAO, cartasPorPalavra } from "@/lib/v2/pontes";
import EscolhaFacetas from "@/components/v2/EscolhaFacetas";
import { IDIOMAS_V2_LISTA, IDIOMA_PADRAO, idiomaV2, classeEscrita } from "@/lib/v2/idiomas.js";

const CHAVE_ULTIMO_IDIOMA = "karta:v2:ultimo-idioma";

// Ícone ⚠ com tooltip: abre com o mouse, com o teclado (foco) e com toque no celular
function Alerta({ texto }) {
  const [aberto, setAberto] = useState(false);
  return (
    <span className={`v2-tw v2-alerta ${aberto ? "aberto" : ""}`} tabIndex={0} role="button" aria-label={texto}
      onClick={() => setAberto((a) => !a)} onBlur={() => setAberto(false)}>
      <span aria-hidden="true">⚠</span>
      <span className="v2-tt v2-tt-quebra" role="tooltip">{texto}</span>
    </span>
  );
}
const MAIS_POR_VEZ = 5;

export default function NovoBaralhoV2() {
  const router = useRouter();
  const [modo, setModo] = useState("tema"); // "tema" (A) | "palavras" (B)
  const [nome, setNome] = useState("");
  const [idioma, setIdioma] = useState(IDIOMA_PADRAO);
  const [nivel, setNivel] = useState(idiomaV2(IDIOMA_PADRAO).niveis[0]);
  // Facetas opcionais do baralho: começam com o padrão escolhido em Configurações
  const [facetas, setFacetas] = useState(FACETAS_PADRAO);
  useEffect(() => { setFacetas(obterFacetasPadrao()); }, []);
  const porPalavra = cartasPorPalavra(facetas);
  const [etapa, setEtapa] = useState(null); // mensagem de progresso
  const [erro, setErro] = useState(null);

  // Modo B
  const [texto, setTexto] = useState("");
  // Modo A
  const [tema, setTema] = useState("");
  const [quantidade, setQuantidade] = useState(10);
  const [revisao, setRevisao] = useState(null); // palavras sugeridas, em revisão: [{ chave, gloss, lemma, sense_hint, origin }]
  const [refinar, setRefinar] = useState(null);  // temas sugeridos pela IA quando o tema não serve (lista)
  const [novaPalavra, setNovaPalavra] = useState("");
  const [manual, setManual] = useState(false); // o campo de adicionar só aparece depois de clicar
  const [descartadas, setDescartadas] = useState(0);
  const cfg = idiomaV2(idioma);

  useEffect(() => {
    const salvo = localStorage.getItem(CHAVE_ULTIMO_IDIOMA);
    const salvoCfg = salvo ? idiomaV2(salvo) : null;
    if (salvoCfg && salvoCfg.codigo === salvo) {
      setIdioma(salvo);
      setNivel(salvoCfg.niveis[0]);
    }
  }, []);

  // Prévia das palavras reconhecidas (chips), antes de gastar IA (seção 3.2)
  const previa = modo === "palavras" && texto.trim() ? lerPalavras(texto, { target_language: idioma, level: nivel }) : null;
  const temaValido = validarTema(tema);

  // Palavra sugerida pela IA, com o resultado da checagem no HSK
  const daIA = (w) => ({ chave: crypto.randomUUID(), gloss: w.gloss, lemma: w.lemma, sense_hint: null, origin: "ai", hsk: w.hsk ?? null, acima: Boolean(w.acima_do_nivel), descartado: w.lemma_descartado ?? null });

  function trocarModo(m) { setModo(m); setErro(null); setRefinar(null); }

  function mudarIdioma(codigo) {
    setIdioma(codigo);
    setNivel(idiomaV2(codigo).niveis[0]);
    localStorage.setItem(CHAVE_ULTIMO_IDIOMA, codigo);
  }

  // ── Modo A: pede palavras ao Módulo 1 ─────────────────────────
  async function pedirPalavras({ count, existentes = [], temaEnviado = null }) {
    const resp = await fetch("/api/v2/palavras", {
      method: "POST", headers: cabecalhosComChave(),
      body: JSON.stringify({ theme: temaEnviado ?? temaValido.tema, level: nivel, count, existing_words: existentes, target_language: idioma }),
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || "Falha ao gerar as palavras.");
    return dados;
  }

  // temaEscolhido: quando a pessoa clica num tema sugerido pela IA
  async function gerarPalavras(e, temaEscolhido = null) {
    e?.preventDefault();
    const t = temaEscolhido ?? temaValido.tema;
    if (!temaEscolhido && temaValido.erro) return setErro(temaValido.erro);
    setErro(null); setRefinar(null); setEtapa("Módulo 1: escolhendo palavras para o tema…");
    try {
      const dados = await pedirPalavras({ count: quantidade, temaEnviado: t });
      if (dados.refinar) { setRefinar(dados.refinar); return; }
      setRevisao(dados.wordList.words.map(daIA));
      setDescartadas(dados.descartadas?.length || 0);
      if (!nome.trim()) setNome(t);
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
    const lidas = lerPalavras(novaPalavra, { target_language: idioma, level: nivel }).wordList?.words || [];
    const glosses = new Set(revisao.map((p) => p.gloss.toLowerCase()));
    const novas = lidas.filter((w) => !glosses.has(w.gloss.toLowerCase()))
      .map((w) => ({ chave: crypto.randomUUID(), gloss: w.gloss, lemma: null, sense_hint: w.sense_hint, origin: "user" }));
    setRevisao([...revisao, ...novas].slice(0, LIMITES.maxPalavras));
    setNovaPalavra("");
  }

  const revisaoValida = revisao?.filter((p) => p.gloss.trim()) || [];
  const wordListRevisada = revisaoValida.length ? {
    origin: "theme", theme: temaValido.tema, target_language: idioma, level: nivel,
    words: revisaoValida.map((p, i) => ({ id: `w${i + 1}`, gloss: p.gloss.trim(), lemma: p.lemma, sense_hint: p.sense_hint, origin: p.origin })),
  } : null;

  // ── Módulos 2 e 3: igual para os dois modos ───────────────────
  async function criarBaralho(wordList, { creation_mode, theme = null }) {
    setErro(null);
    try {
      const repo = await obterRepo();
      setEtapa("Criando o baralho…");
      const deck = await repo.criarBaralho({ name: nome.trim() || theme || "Meu baralho", creation_mode, theme, target_language: idioma, level: nivel, facetas_opcionais: facetas });
      await repo.atualizarBaralho({ ...deck, pipeline_status: "facets_in_progress" });
      registrarEvento("baralho_iniciado", {
        deck_id: deck.id,
        idioma,
        payload: { creation_mode, level: nivel, n_palavras: wordList.words.length },
      });

      setEtapa(`Módulo 2: gerando as facetas de ${wordList.words.length} palavras…`);
      const resp = await fetch("/api/v2/enriquecer", { method: "POST", headers: cabecalhosComChave(), body: JSON.stringify({ wordList }) });
      const dados = await resp.json();
      if (!resp.ok) {
        await repo.atualizarBaralho({ ...deck, pipeline_status: "failed" });
        throw new Error(dados.erro || "Falha ao gerar as facetas.");
      }

      setEtapa("Módulo 3: montando as cartas…");
      const criadas = await repo.adicionarPalavras(deck.id, dados.resultados);
      await repo.atualizarBaralho({ ...deck, pipeline_status: "cards_ready", modelo: dados.modelo, versao_prompt: dados.versaoPrompt });
      registrarEvento("baralho_criado", {
        deck_id: deck.id,
        idioma,
        payload: { creation_mode, level: nivel, n_palavras: criadas.palavras, n_cartas: criadas.cartas },
      });
      router.push(`/baralho/${deck.id}${dados.doBanco ? `?doBanco=${dados.doBanco}` : ""}`);
    } catch (err) {
      setErro(err.message);
      setEtapa(null);
    }
  }

  const caixaAudio = (
    <div>
      <span className="lb">O que cada palavra traz</span>
      <EscolhaFacetas facetas={facetas} aoMudar={setFacetas} desabilitado={Boolean(etapa)} />
    </div>
  );
  const seletorIdioma = (
    <div>
      <span className="lb">Idioma</span>
      <div className="chips">
        {IDIOMAS_V2_LISTA.map((i) => (
          <button type="button" key={i.codigo} className={`ch ${idioma === i.codigo ? "on" : ""}`} onClick={() => mudarIdioma(i.codigo)} disabled={Boolean(revisao)}>
            {i.nome}
          </button>
        ))}
      </div>
    </div>
  );
  const seletorNivel = (
    <div>
      <span className="lb">Nível</span>
      <div className="chips">{cfg.niveis.map((n) => <button type="button" key={n} className={`ch ${nivel === n ? "on" : ""}`} onClick={() => setNivel(n)} disabled={Boolean(revisao)}>{n}</button>)}</div>
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
    <div className="v2-novo">
      <Link href="/" className="mu">← Baralhos</Link>
      <h1 style={{ margin: "12px 0 8px" }}>Novo baralho</h1>
      <p className="mu" style={{ marginBottom: 20 }}>Cada palavra vira até 7 cartas, uma para cada conexão. Escolha o idioma, o nível e o tema.</p>
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
            {refinar && (
              <p style={{ margin: "10px 0 0" }}>
                <span className="mu">A IA não conseguiu montar um baralho com esse tema.</span>
                {refinar.length > 0 && <> <span className="mu">Experimente:</span>{" "}
                  {refinar.map((t, i) => (
                    <span key={t}>{i > 0 && <span className="mu"> · </span>}
                      <button type="button" className="v2-link" onClick={() => { setTema(t); gerarPalavras(null, t); }}>{t}</button></span>
                  ))}</>}
              </p>
            )}
          </div>
          <div>
            <label className="lb" htmlFor="qtd">Quantas palavras</label>
            <input id="qtd" className="fi" type="number" min={LIMITES.minPalavras} max={LIMITES.maxPalavras} value={quantidade}
              onChange={(e) => setQuantidade(Math.max(LIMITES.minPalavras, Math.min(LIMITES.maxPalavras, Number(e.target.value) || 1)))} style={{ maxWidth: 120 }} />
          </div>
          {seletorIdioma}
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
            <span className="lb">Palavras sugeridas para “{temaValido.tema}” · {cfg.nome} · {nivel}</span>
            <p className="mu" style={{ fontSize: 13, margin: "0 0 10px" }}>
              Edite, remova ou acrescente. Palavra editada ou acrescentada é traduzida de novo na próxima etapa.
              {descartadas > 0 && ` (${descartadas} sugestão(ões) repetida(s) ou inválida(s) foram descartadas.)`}
            </p>
            {/* Uma grade só para todas as linhas: a coluna do mandarim fica do tamanho da palavra mais longa */}
            <div className="v2-revisao">
              {revisao.map((p) => {
                const alerta = cfg.codigo === "zh" && p.descartado
                  ? `${p.descartado} não está na lista oficial do HSK. Na próxima etapa, a palavra será conferida de novo a partir do português.`
                  : cfg.codigo === "zh" && p.acima ? (p.hsk === 7 ? `Esta palavra não está nos níveis HSK 1 a 6: é mais avançada que o ${nivel}.` : `Esta palavra é do HSK ${p.hsk}, acima do ${nivel} que você escolheu.`)
                  : null;
                return (
                  <div key={p.chave} className="v2-revisao-linha">
                    <span className="v2-revisao-hanzi">
                      <span className={classeEscrita(cfg)} lang={cfg.codigoVoz} title={p.lemma || p.descartado ? undefined : "Será traduzida na próxima etapa"}>{p.lemma || p.descartado || "…"}</span>
                      {alerta && <Alerta texto={alerta} />}
                    </span>
                    <input className="fi v2-fi" value={p.gloss} onChange={(e) => editar(p.chave, e.target.value)} aria-label="Palavra em português" maxLength={LIMITES.maxCaracteres} disabled={Boolean(etapa)} />
                    <span>{p.origin === "user" && <span className="tg">sua</span>}</span>
                    <button type="button" className="v2-x" onClick={() => remover(p.chave)} aria-label={`Remover ${p.gloss}`} title="Remover" disabled={Boolean(etapa)}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>
          {manual && (
            <form onSubmit={acrescentar} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input className="fi v2-fi" value={novaPalavra} onChange={(e) => setNovaPalavra(e.target.value)} placeholder="laranja, banco (dinheiro)" disabled={Boolean(etapa)} autoFocus aria-label="Palavras para adicionar" />
              <button type="submit" className="bo v2-bo-p" disabled={!novaPalavra.trim() || Boolean(etapa)}>Adicionar</button>
              <button type="button" className="v2-x" onClick={() => { setManual(false); setNovaPalavra(""); }} aria-label="Fechar" title="Fechar">✕</button>
            </form>
          )}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {!manual && <button type="button" className="v2-link" onClick={() => setManual(true)} disabled={Boolean(etapa) || revisao.length >= LIMITES.maxPalavras}>+ Adicionar manualmente</button>}
            <button type="button" className="v2-link" onClick={pedirMais} disabled={Boolean(etapa) || revisao.length >= LIMITES.maxPalavras}>+ Pedir mais {MAIS_POR_VEZ} à IA</button>
          </div>
          {campoNome}
          {caixaAudio}
          {caixaErro}
          {etapa ? <div className="aviso">{etapa}</div> : (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="btn" type="button" disabled={!wordListRevisada} onClick={() => criarBaralho(wordListRevisada, { creation_mode: "theme", theme: temaValido.tema })}>
                Criar baralho{wordListRevisada ? ` (${wordListRevisada.words.length} palavras · até ${wordListRevisada.words.length * porPalavra} cartas)` : ""}
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
          {seletorIdioma}
          {seletorNivel}
          {caixaAudio}
          {caixaErro}
          {etapa ? <div className="aviso">{etapa}</div> : (
            <div><button className="btn" type="submit" disabled={!previa?.wordList}>
              Criar baralho{previa?.wordList ? ` (${previa.wordList.words.length} palavras · até ${previa.wordList.words.length * porPalavra} cartas)` : ""}
            </button></div>
          )}
        </form>
      )}
    </div>
  );
}
