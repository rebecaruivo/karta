"use client";
// v2 · Tela do baralho: palavras, alertas da IA, prévia das cartas e edição
// (acrescentar palavras, corrigir uma palavra, gerar uma palavra de novo — seções 3.3 e 6.4)
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { obterRepo, facetasDe } from "@/lib/v2/cliente";
import { montarFila } from "@/lib/v2/sessao";
import Carta from "@/components/v2/Carta";
import { gerarAudiosDoBaralho } from "@/lib/v2/gerarAudios";
import { obterModoAudio, podeGerarAudio } from "@/lib/preferencias";
import { lerPalavras, LIMITES } from "@/lib/v2/portaEntrada";
import { separarPorGloss, separarRepetidas, escritasDoBaralho } from "@/lib/v2/edicao";
import { cabecalhosComChave } from "@/lib/chave";

const MAIS_POR_VEZ = 5;

// Chama o Módulo 2 (rota do servidor) para uma lista de palavras
async function chamarModulo2(deck, palavras) {
  const wordList = {
    origin: deck.creation_mode === "theme" ? "theme" : "words", theme: deck.theme ?? null, target_language: "zh", level: deck.level,
    words: palavras.map((p, i) => ({ id: `w${i + 1}`, gloss: p.gloss, lemma: p.lemma ?? null, sense_hint: p.sense_hint ?? null, origin: p.origin ?? "user" })),
  };
  const resp = await fetch("/api/v2/enriquecer", { method: "POST", headers: cabecalhosComChave(), body: JSON.stringify({ wordList }) });
  const dados = await resp.json();
  if (!resp.ok) throw new Error(dados.erro || "Falha ao gerar as facetas.");
  return dados.resultados;
}

// ── Acrescentar palavras: digitar ou pedir à IA, revisar e só então gerar as cartas
function Acrescentar({ deck, palavras, cartasPorPalavra, aoTerminar, aoFechar }) {
  const [texto, setTexto] = useState("");
  const [lista, setLista] = useState([]); // [{ chave, gloss, lemma, sense_hint, origin }]
  const [etapa, setEtapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  // Tema para o "pedir à IA": o do baralho, se houver; senão, a pessoa digita (o nome do baralho não serve de tema)
  const [tema, setTema] = useState(deck.theme ?? "");
  const [pedindoIA, setPedindoIA] = useState(false); // o campo de tema só aparece depois de clicar
  const temaLimpo = tema.trim();

  // Junta na lista, sem repetir o que já está nela nem o que o baralho já tem
  function juntar(novas) {
    const { seguir, repetidas } = separarPorGloss(novas, [...palavras, ...lista.map((p) => ({ concept: { gloss: p.gloss } }))]);
    setLista((l) => [...l, ...seguir.map((p) => ({ chave: crypto.randomUUID(), ...p }))].slice(0, LIMITES.maxPalavras));
    setAviso(repetidas.length ? `Já estavam no baralho ou na lista: ${repetidas.map((p) => p.gloss).join(", ")}.` : null);
  }

  function digitar(e) {
    e.preventDefault();
    const lidas = lerPalavras(texto, { target_language: "zh", level: deck.level }).wordList?.words || [];
    juntar(lidas.map((w) => ({ gloss: w.gloss, lemma: null, sense_hint: w.sense_hint, origin: "user" })));
    setTexto("");
  }

  async function pedirIA() {
    if (!temaLimpo) return setErro("Digite um tema para a IA sugerir palavras.");
    setErro(null); setEtapa(`Módulo 1: buscando palavras de “${temaLimpo}”…`);
    try {
      const existentes = [...escritasDoBaralho(palavras), ...lista.map((p) => p.lemma).filter(Boolean)];
      const resp = await fetch("/api/v2/palavras", { method: "POST", headers: cabecalhosComChave(), body: JSON.stringify({ theme: temaLimpo.slice(0, LIMITES.maxTema), level: deck.level, count: MAIS_POR_VEZ, existing_words: existentes }) });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro || "Falha ao buscar palavras.");
      if (dados.refinar) throw new Error(`O tema “${temaLimpo}” ficou amplo demais. ${dados.refinar}`);
      if (!dados.wordList.words.length) throw new Error("A IA não encontrou palavras novas para esse tema.");
      juntar(dados.wordList.words.map((w) => ({ gloss: w.gloss, lemma: w.lemma, sense_hint: null, origin: "ai" })));
      // O tema que funcionou passa a ser o tema do baralho (para a próxima vez)
      if (temaLimpo !== (deck.theme ?? "")) await (await obterRepo()).atualizarBaralho({ ...deck, theme: temaLimpo });
    } catch (err) { setErro(err.message); } finally { setEtapa(null); }
  }

  async function adicionar() {
    const validas = lista.filter((p) => p.gloss.trim());
    setLista(validas);
    setErro(null); setEtapa(`Módulo 2: gerando as facetas de ${validas.length} palavras…`);
    try {
      const resultados = await chamarModulo2(deck, validas);
      const { novas, repetidas } = separarRepetidas(resultados.filter((r) => r.facets?.length), palavras);
      const falharam = resultados.filter((r) => !r.facets?.length);
      setEtapa("Módulo 3: montando as cartas…");
      const r = await (await obterRepo()).adicionarPalavras(deck.id, novas);
      const partes = [`${r.palavras} palavra(s) e ${r.cartas} cartas adicionadas.`];
      if (repetidas.length) partes.push(`Ficaram de fora porque o baralho já tinha o mesmo mandarim: ${repetidas.map((p) => `${p.concept.gloss} (${p.facets[0].value})`).join(", ")}.`);
      if (falharam.length) partes.push(`A IA não gerou: ${falharam.map((p) => p.concept.gloss).join(", ")}.`);
      aoTerminar(partes.join(" "));
    } catch (err) { setErro(err.message); setEtapa(null); }
  }

  const ocupado = Boolean(etapa);
  return (
    <div className="aviso" style={{ display: "grid", gap: 14, marginBottom: 24 }}>
      <strong>Acrescentar palavras</strong>
      <form onSubmit={digitar} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input className="fi v2-fi" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite: laranja, banco (dinheiro)" disabled={ocupado} />
        <button type="submit" className="bo v2-bo-p" disabled={!texto.trim() || ocupado}>Adicionar</button>
      </form>
      {!pedindoIA ? (
        <div><button type="button" className="v2-link" onClick={() => setPedindoIA(true)} disabled={ocupado}>+ Pedir palavras à IA</button></div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); pedirIA(); }} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="fi v2-fi" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Tema: frutas, no restaurante…" maxLength={LIMITES.maxTema} disabled={ocupado} style={{ flex: "1 1 220px", maxWidth: 360 }} aria-label="Tema para a IA" autoFocus />
          <button type="submit" className="bo v2-bo-p" disabled={ocupado || !temaLimpo || lista.length >= LIMITES.maxPalavras}>Sugerir {MAIS_POR_VEZ}</button>
          <button type="button" className="v2-link" onClick={() => setPedindoIA(false)} disabled={ocupado}>Fechar</button>
        </form>
      )}
      {aviso && <p className="mu" style={{ fontSize: 13, margin: 0 }}>{aviso}</p>}
      {lista.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <span className="mu" style={{ fontSize: 13 }}>Revise antes de gerar as cartas. Palavra editada é traduzida de novo.</span>
          {lista.map((p) => (
            <div key={p.chave} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="z" style={{ minWidth: 56, fontSize: 20 }}>{p.lemma || "…"}</span>
              <input className="fi v2-fi" value={p.gloss} maxLength={LIMITES.maxCaracteres} disabled={ocupado} aria-label="Palavra em português"
                onChange={(e) => setLista(lista.map((x) => (x.chave === p.chave ? { ...x, gloss: e.target.value, lemma: null, origin: "user" } : x)))} />
              {p.origin === "user" && <span className="tg">sua</span>}
              <button type="button" className="v2-link" disabled={ocupado} aria-label={`Remover ${p.gloss}`} onClick={() => setLista(lista.filter((x) => x.chave !== p.chave))}>remover</button>
            </div>
          ))}
        </div>
      )}
      {erro && <div className="erro">{erro}</div>}
      {etapa ? <div className="mu">{etapa}</div> : (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="btn" disabled={!lista.some((p) => p.gloss.trim())} onClick={adicionar}>
            Gerar as cartas{lista.length ? ` (${lista.length} palavras · até ${lista.length * cartasPorPalavra})` : ""}
          </button>
          <button className="v2-link" onClick={aoFechar}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

// ── Corrigir uma palavra: textos pequenos à mão, ou gerar de novo com a IA
function Corrigir({ deck, palavra, palavras, aoTerminar, aoFechar }) {
  const { word, meaning, sentence } = facetasDe(palavra);
  const [significado, setSignificado] = useState(meaning?.value ?? "");
  const [pinyin, setPinyin] = useState(word?.metadata?.pinyin ?? "");
  const [traducao, setTraducao] = useState(sentence?.metadata?.translation ?? "");
  const [reiniciar, setReiniciar] = useState(false);
  const [afetadas, setAfetadas] = useState({}); // facetId → ids das cartas que a mostram
  const [novaGloss, setNovaGloss] = useState(palavra.concept.gloss);
  const [sentido, setSentido] = useState(palavra.concept.sense_hint ?? "");
  const [etapa, setEtapa] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    obterRepo().then(async (repo) => {
      const mapa = {};
      for (const f of [word, meaning, sentence].filter(Boolean)) mapa[f.id] = (await repo.cartasAfetadas(f.id)).map((c) => c.id);
      setAfetadas(mapa);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mudancas = [
    meaning && significado.trim() !== (meaning.value ?? "") && [meaning.id, { value: significado.trim() }],
    word && pinyin.trim() !== (word.metadata?.pinyin ?? "") && [word.id, { metadata: { pinyin: pinyin.trim() } }],
    sentence && traducao.trim() !== (sentence.metadata?.translation ?? "") && [sentence.id, { metadata: { translation: traducao.trim() } }],
  ].filter(Boolean);
  const nAfetadas = new Set(mudancas.flatMap(([id]) => afetadas[id] || [])).size;

  async function salvar() {
    setErro(null);
    if (mudancas.some(([, m]) => m.value === "" || m.metadata?.pinyin === "")) return setErro("Significado e pinyin não podem ficar vazios.");
    const repo = await obterRepo();
    for (const [id, m] of mudancas) await repo.editarFaceta(id, m, { reiniciar });
    aoTerminar(`Correção salva${reiniciar && nAfetadas ? `; ${nAfetadas} cartas voltaram a ser novas` : "; o histórico de estudo foi mantido"}.`);
  }

  async function gerarDeNovo() {
    const gloss = novaGloss.trim();
    if (!gloss) return setErro("Digite a palavra em português.");
    const trocou = gloss.toLowerCase() !== palavra.concept.gloss.toLowerCase();
    if (trocou && palavras.some((p) => p.concept.id !== palavra.concept.id && p.concept.gloss.toLowerCase() === gloss.toLowerCase())) return setErro(`O baralho já tem “${gloss}”.`);
    if (!window.confirm(`Gerar ${trocou ? `“${gloss}” no lugar de “${palavra.concept.gloss}”` : `“${gloss}” de novo`}? As cartas desta palavra recomeçam do zero e as gravações dela precisam ser geradas outra vez.`)) return;
    setErro(null); setEtapa("Módulo 2: gerando a palavra de novo…");
    try {
      const [r] = await chamarModulo2(deck, [{ gloss, sense_hint: sentido.trim() || null, origin: trocou ? "user" : palavra.concept.origin }]);
      if (!r?.facets?.length) throw new Error("A IA não gerou a palavra. Tente de novo.");
      await (await obterRepo()).substituirPalavra(palavra.concept.id, r);
      const antes = word?.value, depois = r.facets[0].value;
      aoTerminar(`“${gloss}” foi gerada de novo: ${depois}${antes === depois ? " (a IA manteve o mesmo mandarim; frase e significado foram refeitos)" : ` (antes: ${antes})`}.`);
    } catch (err) { setErro(err.message); setEtapa(null); }
  }

  const campo = (rotulo, valor, set, extra = {}) => (
    <label style={{ display: "grid", gap: 4 }}><span className="lb" style={{ margin: 0 }}>{rotulo}</span>
      <input className="fi v2-fi" value={valor} onChange={(e) => set(e.target.value)} disabled={Boolean(etapa)} {...extra} /></label>
  );
  return (
    <div className="aviso" style={{ display: "grid", gap: 12, margin: "8px 0 24px" }}>
      <strong>Corrigir “{palavra.concept.gloss}” <span className="v2-cjk">{word?.value}</span></strong>
      {campo("Significado", significado, setSignificado, { maxLength: 80 })}
      {campo("Pinyin", pinyin, setPinyin, { maxLength: 60 })}
      {campo(`Tradução da frase (${sentence?.value ?? ""})`, traducao, setTraducao, { maxLength: 200 })}
      {mudancas.length > 0 && (
        <label style={{ display: "flex", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={reiniciar} onChange={(e) => setReiniciar(e.target.checked)} />
          <span>Recomeçar o estudo das {nAfetadas} cartas que mostram o que mudou<br />
            <span className="mu" style={{ fontSize: 13 }}>Deixe desmarcado para erros de digitação; marque se o conteúdo mudou de verdade.</span></span>
        </label>
      )}
      {erro && <div className="erro">{erro}</div>}
      {!etapa && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="btn" onClick={salvar} disabled={!mudancas.length}>Salvar correção</button>
          <button className="v2-link" onClick={aoFechar}>Cancelar</button>
        </div>
      )}
      <hr style={{ border: 0, borderTop: "1px solid currentColor", opacity: 0.15, margin: "4px 0" }} />
      <strong style={{ fontSize: 15 }}>Gerar de novo com a IA</strong>
      <span className="mu" style={{ fontSize: 13, marginTop: -6 }}>Para erros maiores: palavra errada, frase ruim, sentido trocado. Mude a palavra em português se quiser outra; use o sentido para palavras com mais de um significado (banco → dinheiro).</span>
      {etapa ? <div className="mu">{etapa}</div> : (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr auto", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4 }}><span className="lb" style={{ margin: 0 }}>Palavra em português</span>
            <input className="fi v2-fi" value={novaGloss} onChange={(e) => setNovaGloss(e.target.value)} maxLength={LIMITES.maxCaracteres} /></label>
          <label style={{ display: "grid", gap: 4 }}><span className="lb" style={{ margin: 0 }}>Sentido (opcional)</span>
            <input className="fi v2-fi" value={sentido} onChange={(e) => setSentido(e.target.value)} placeholder="ex.: dinheiro, fruta" maxLength={40} /></label>
          <button className="bo v2-bo-p" onClick={gerarDeNovo}>Gerar de novo</button>
        </div>
      )}
    </div>
  );
}

// Nomes e etiquetas das conexões, como no protótipo
const NOMES = [
  ["AUDIO_TO_WORD", "Áudio → Palavra", "Áudio na frente"],
  ["AUDIO_TO_MEANING", "Áudio → Significado", "Áudio na frente"],
  ["WORD_TO_AUDIO", "Palavra → Áudio", "Áudio no verso"],
  ["MEANING_TO_SENTENCE", "Significado → Frase", "Frase no verso"],
  ["SENTENCE_AUDIO_TO_SENTENCE", "Áudio da frase → Frase", "Frase no verso"],
  ["CLOZE_SENTENCE_TO_WORD", "Frase com lacuna → Palavra", "Frase na frente"],
  ["WORD_TO_MEANING", "Palavra → Significado", "Texto nos dois lados"],
];

function Previa({ palavra, cartas, comAudio }) {
  const [viradas, setViradas] = useState({});
  const pontes = new Set(cartas.map((c) => c.bridge_template_id));
  return (
    <div className="v2-grade" style={{ margin: "16px 0 32px" }}>
      {NOMES.filter(([id]) => pontes.has(id)).map(([id, nome, tag]) => (
        <div key={id}>
          <div className="v2-rotulo-ponte">{nome} <span className="v2-tag">{tag}</span></div>
          <Carta ponte={id} palavra={palavra} virada={!!viradas[id]} autoTocar={false} comAudio={comAudio}
            aoVirar={() => setViradas((v) => ({ ...v, [id]: !v[id] }))} />
        </div>
      ))}
    </div>
  );
}

export default function BaralhoV2() {
  const { id } = useParams();
  const router = useRouter();
  const [dados, setDados] = useState(undefined);
  const [aberta, setAberta] = useState(null);
  const [pendentes, setPendentes] = useState(0);
  const [modoAudio, setModoAudio] = useState(null);
  const [gerando, setGerando] = useState(null); // "3 de 10"
  const [avisoAudio, setAvisoAudio] = useState(null);
  const [menuEditar, setMenuEditar] = useState(false);
  const [acrescentando, setAcrescentando] = useState(false);
  const [selecionando, setSelecionando] = useState(false); // checkboxes à direita das palavras
  const [selecionadas, setSelecionadas] = useState(() => new Set());
  const [corrigindo, setCorrigindo] = useState([]); // concept ids com o painel de correção aberto
  const [mensagem, setMensagem] = useState(null);

  const carregar = async () => {
    const repo = await obterRepo();
    setDados(await repo.carregarBaralho(id));
    setPendentes((await repo.audiosPendentes(id)).length);
  };
  useEffect(() => { carregar(); setModoAudio(obterModoAudio()); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc fecha o menu "Editar"
  useEffect(() => {
    if (!menuEditar) return;
    const tecla = (e) => e.key === "Escape" && setMenuEditar(false);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [menuEditar]);

  if (dados === undefined) return null;
  if (dados === null) return <p>Baralho não encontrado. <Link href="/v2">Voltar</Link></p>;

  const { deck, palavras, cartas } = dados;
  const paraEstudar = montarFila(cartas).length;
  const comAudio = (deck.facetas_opcionais ?? ["AUDIO"]).includes("AUDIO");

  function sairDaSelecao() { setSelecionando(false); setSelecionadas(new Set()); }
  function escolher(opcao) {
    setMenuEditar(false); setMensagem(null);
    if (opcao === "acrescentar") { setAcrescentando(true); sairDaSelecao(); }
    if (opcao === "selecionar") { setSelecionando(true); setAcrescentando(false); }
  }
  function alternar(conceptId) {
    setSelecionadas((s) => { const n = new Set(s); n.has(conceptId) ? n.delete(conceptId) : n.add(conceptId); return n; });
  }
  const todasMarcadas = palavras.length > 0 && selecionadas.size === palavras.length;

  const terminouAcrescentar = (texto) => { setMensagem(texto); setAcrescentando(false); carregar(); };
  // Cada painel de correção termina sozinho; os outros continuam abertos
  const terminouCorrecao = (conceptId) => (texto) => { setMensagem(texto); setCorrigindo((l) => l.filter((x) => x !== conceptId)); carregar(); };

  async function excluirSelecionadas() {
    const ids = [...selecionadas];
    const n = cartas.filter((c) => ids.includes(c.concept_id)).length;
    if (!window.confirm(`Excluir ${ids.length} palavra(s) e as ${n} cartas delas? Não dá para desfazer.`)) return;
    const repo = await obterRepo();
    for (const conceptId of ids) await repo.excluirPalavra(conceptId);
    setCorrigindo((l) => l.filter((x) => !ids.includes(x)));
    setMensagem(`${ids.length} palavra(s) excluída(s).`);
    sairDaSelecao(); carregar();
  }
  function corrigirSelecionadas() {
    setCorrigindo([...selecionadas]);
    setMensagem(null);
    sairDaSelecao();
  }

  async function gerarAudios() {
    setAvisoAudio(null);
    const r = await gerarAudiosDoBaralho(await obterRepo(), deck.id, ({ feitos, total }) => setGerando(`${feitos} de ${total}`));
    setGerando(null);
    if (r.parou) setAvisoAudio(`${r.parou} ${r.feitos} gravações foram salvas; o resto continua de onde parou.`);
    else if (r.falhas) setAvisoAudio(`${r.falhas} gravações falharam. Clique de novo para tentar.`);
    carregar();
  }
  async function excluirBaralho() {
    if (!window.confirm("Excluir o baralho inteiro? Não dá para desfazer.")) return;
    await (await obterRepo()).excluirBaralho(deck.id);
    router.push("/v2");
  }

  return (
    <>
      <Link href="/v2" className="mu">← Baralhos da v2</Link>
      <div className="cabecalho" style={{ marginTop: 12 }}>
        <div>
          <h1><span className="z">中</span> {deck.name}</h1>
          <p className="mu">Mandarim · {deck.level} · {palavras.length} palavras · {cartas.length} cartas</p>
        </div>
        <div className="acoes">
          <div className="v2-menu-ancora">
            <button className="bo" onClick={() => setMenuEditar((m) => !m)} aria-expanded={menuEditar} aria-haspopup="menu">Editar</button>
            {menuEditar && (
              <div className="v2-menu" role="menu">
                <button role="menuitem" onClick={() => escolher("acrescentar")}>
                  <strong>Acrescentar palavras</strong><span className="mu">Digitar ou pedir à IA</span>
                </button>
                <button role="menuitem" onClick={() => escolher("selecionar")} disabled={!palavras.length}>
                  <strong>Corrigir ou excluir palavras</strong><span className="mu">Selecione uma ou mais na lista</span>
                </button>
                <button role="menuitem" className="v2-perigo" onClick={() => { setMenuEditar(false); excluirBaralho(); }}>
                  <strong>Excluir baralho</strong><span className="mu">Apaga o baralho e todas as cartas</span>
                </button>
              </div>
            )}
          </div>
          <Link href={`/v2/estudar/${deck.id}`} className="btn">Estudar ({paraEstudar})</Link>
        </div>
      </div>

      {comAudio && podeGerarAudio(modoAudio) && (pendentes > 0 || gerando) && (
        <p className="mu" style={{ marginBottom: 20 }}>
          {gerando ? `Gerando gravações com o Gemini… ${gerando}` : <>{pendentes} gravações por gerar{modoAudio === "cota_e_navegador" && " (enquanto isso, as cartas usam a voz do navegador)"} · <button className="v2-link" onClick={gerarAudios}>Gerar áudios</button></>}
        </p>
      )}
      {avisoAudio && <div className="erro" style={{ marginBottom: 20 }}>{avisoAudio}</div>}
      {!comAudio && <p className="mu" style={{ marginBottom: 16 }}>Baralho sem exercícios de áudio: 3 cartas por palavra.</p>}

      {mensagem && <div className="aviso" style={{ marginBottom: 16 }}>{mensagem}</div>}
      {acrescentando && <Acrescentar deck={deck} palavras={palavras} cartasPorPalavra={comAudio ? 7 : 3} aoTerminar={terminouAcrescentar} aoFechar={() => setAcrescentando(false)} />}

      {palavras.length === 0 && !acrescentando && (
        <p className="mu" style={{ margin: "24px 0" }}>Este baralho está sem palavras. Use <strong>Editar → Acrescentar palavras</strong>.</p>
      )}
      {palavras.length > 0 && <div className="lr lh">
        <span>Palavra</span><span>Pinyin</span><span>Significado e frase</span>
        <span className="v2-col-sel">
          {selecionando && <label className="v2-check" title="Selecionar todas">todas <input type="checkbox" checked={todasMarcadas} onChange={() => setSelecionadas(todasMarcadas ? new Set() : new Set(palavras.map((p) => p.concept.id)))} /></label>}
        </span>
      </div>}
      {palavras.map((p) => {
        const { word, meaning, sentence } = facetasDe(p);
        const cartasDaPalavra = cartas.filter((c) => c.concept_id === p.concept.id);
        const alertas = [
          meaning?.metadata?.ambiguous && `também pode ser: ${meaning.metadata.other_senses}`,
          word?.metadata?.level_fit === false && "acima do nível",
        ].filter(Boolean);
        const marcada = selecionadas.has(p.concept.id);
        return (
          <div key={p.concept.id}>
            <div className={`lr ${marcada ? "v2-marcada" : ""}`}>
              <span className="pal v2-cjk">{word?.value}</span>
              <span className="mu" style={{ fontSize: 15 }}>{word?.metadata?.pinyin}</span>
              <span>
                <strong>{meaning?.value}</strong> <span className="mu">· {word?.metadata?.pos} · você digitou "{p.concept.gloss}"</span><br />
                <span className="mu v2-cjk">{sentence?.value}</span><br /><span className="mu" style={{ fontSize: 13 }}>{sentence?.metadata?.translation}</span>
                {alertas.length > 0 && <><br /><span className="mu" style={{ fontSize: 13 }}>⚠ {alertas.join(" · ")}</span></>}
              </span>
              <span className="v2-col-sel">
                <button className="v2-link" onClick={() => setAberta(aberta === p.concept.id ? null : p.concept.id)}>
                  {aberta === p.concept.id ? "Fechar cartas" : `Ver as ${cartasDaPalavra.length} cartas`}
                </button>
                {selecionando && <input type="checkbox" className="v2-check-caixa" checked={marcada} onChange={() => alternar(p.concept.id)} aria-label={`Selecionar ${meaning?.value ?? p.concept.gloss}`} />}
              </span>
            </div>
            {corrigindo.includes(p.concept.id) && (
              <Corrigir key={p.concept.id} deck={deck} palavra={p} palavras={palavras} aoTerminar={terminouCorrecao(p.concept.id)}
                aoFechar={() => setCorrigindo((l) => l.filter((x) => x !== p.concept.id))} />
            )}
            {aberta === p.concept.id && <Previa palavra={p} cartas={cartasDaPalavra} comAudio={comAudio} />}
          </div>
        );
      })}

      {/* Barra da seleção: aparece embaixo e acompanha a rolagem */}
      {selecionando && (
        <div className="v2-barra-selecao" role="toolbar" aria-label="Ações nas palavras selecionadas">
          <span>{selecionadas.size ? `${selecionadas.size} selecionada(s)` : "Selecione as palavras"}</span>
          {selecionadas.size > 0 && <>
            <button className="v2-link" onClick={corrigirSelecionadas}>Corrigir</button>
            <button className="v2-link" onClick={excluirSelecionadas}>Excluir</button>
          </>}
          <button className="v2-link" onClick={sairDaSelecao}>Cancelar</button>
        </div>
      )}

      {deck.modelo && <p className="mu" style={{ marginTop: 32 }}>Facetas geradas com {deck.modelo} · prompt v{deck.versao_prompt}</p>}
    </>
  );
}
