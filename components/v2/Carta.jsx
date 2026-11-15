"use client";
// ─────────────────────────────────────────────────────────────
// CARTA DA V2: os 7 tipos do catálogo de pontes, fiéis ao protótipo
// "Cartas por conexão" (docs/arquitetura/cartas-por-conexao.html).
// Esqueleto fixo (seção 6.2): instrução no topo, conteúdo ao centro, ação embaixo.
// A carta não guarda conteúdo: lê as facetas da palavra (modelo de CauanGS).
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { facetasDe, obterRepo } from "@/lib/v2/cliente";
import { CATALOGO_PONTES } from "@/lib/v2/pontes";
import { obterModoAudio, usaGravacao, usaVozDoNavegador } from "@/lib/preferencias";

const PONTE = Object.fromEntries(CATALOGO_PONTES.map((p) => [p.id, p]));
const parar = (e) => e.stopPropagation(); // clicar num botão não vira a carta

const IconePlay = () => (<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>);
const IconeInfo = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M12 11v5M12 8h.01" /></svg>);
const IconeSom = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>);

// Toca o áudio da faceta conforme o modo escolhido em Configurações:
// gravação do Gemini, voz do navegador, ou gravação com a voz do navegador como reserva.
// "Lenta" toca o MESMO áudio a 0,7× (decisão: não gerar um segundo arquivo).
// Devolve false quando não há som possível (modo "só a cota" sem gravação).
async function tocar(faceta, texto, lenta, aoTerminar) {
  const velocidade = lenta ? 0.7 : 1;
  const modo = obterModoAudio();
  try {
    if (usaGravacao(modo) && faceta?.status === "ready") {
      const blob = await (await obterRepo()).obterAudio(faceta.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.playbackRate = velocidade;
        audio.onended = () => { URL.revokeObjectURL(url); aoTerminar(); };
        await audio.play();
        return true;
      }
    }
  } catch { /* segue para a voz do navegador */ }
  if (!usaVozDoNavegador(modo)) { aoTerminar(); return false; }
  if (typeof window === "undefined" || !("speechSynthesis" in window)) { aoTerminar(); return false; }
  const fala = new SpeechSynthesisUtterance(texto);
  fala.lang = "zh-CN";
  fala.rate = 0.9 * velocidade;
  fala.onend = aoTerminar;
  fala.onerror = aoTerminar;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(fala);
  return true;
}

function BotaoPlay({ faceta, texto, lenta = false, autoTocar = false }) {
  const [tocando, setTocando] = useState(false);
  const [semSom, setSemSom] = useState(false);
  const play = async () => { setTocando(true); setSemSom(!(await tocar(faceta, texto, lenta, () => setTocando(false)))); };
  useEffect(() => { if (autoTocar) play(); }, [autoTocar]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span style={{ display: "grid", justifyItems: "center", gap: 6 }}>
      <button className={`v2-pb ${tocando ? "tocando" : ""}`} aria-label="Ouvir" onClick={(e) => { parar(e); play(); }}>
        <IconePlay />
      </button>
      {semSom && <span className="v2-sub" style={{ fontSize: 13 }}>Áudio ainda não gerado</span>}
    </span>
  );
}

function BotaoOuvirFrase({ faceta, texto }) {
  return (
    <button className="v2-tb" onClick={(e) => { parar(e); tocar(faceta, texto, false, () => {}); }}>
      <IconeSom /> Ouvir frase
    </button>
  );
}

// Tooltip: mouse no computador (CSS), toque no celular (estado), foco pelo teclado (CSS)
function Dica({ rotulo, texto }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => { if (!ref.current?.contains(e.target)) setAberto(false); };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);
  return (
    <span ref={ref} className={`v2-tw ${aberto ? "aberto" : ""}`} onClick={parar}>
      <button className="v2-tp" aria-label={rotulo} aria-expanded={aberto} onClick={() => setAberto((a) => !a)}><IconeInfo /></button>
      <span className="v2-tt" role="tooltip">{texto}</span>
    </span>
  );
}

// Frase com a palavra destacada ou com a lacuna, a partir de cloze_indices [início, fim)
function Frase({ sentence, modo, tamanho = 30 }) {
  const chars = Array.from(sentence.value);
  const [ini, fim] = sentence.metadata?.cloze_indices || [0, 0];
  const meio = chars.slice(ini, fim).join("");
  return (
    <p className="v2-cjk" lang="zh" style={{ fontSize: tamanho, margin: 0 }}>
      {chars.slice(0, ini).join("")}
      {modo === "lacuna" ? <span className="v2-bl" aria-label="lacuna" /> : <mark>{meio}</mark>}
      {chars.slice(fim).join("")}
    </p>
  );
}

const Hanzi = ({ texto, tamanho = 72 }) => (<span className="v2-cjk" lang="zh" style={{ fontSize: tamanho, lineHeight: 1 }}>{texto}</span>);
const Significado = ({ texto }) => (<h2 className="v2-h" style={{ margin: 0, fontSize: 44, fontWeight: 600, lineHeight: 1.1 }}>{texto}</h2>);

function Faces({ ponte, f, virada, lenta, setLenta, auto, comAudio }) {
  const { word, meaning, sentence, audioPalavra, audioFrase } = f;
  const pinyin = word.metadata?.pinyin;
  switch (ponte) {
    case "AUDIO_TO_WORD": return {
      frente: { centro: <BotaoPlay faceta={audioPalavra} texto={word.value} autoTocar={auto && !virada} /> },
      verso: { centro: <><Hanzi texto={word.value} tamanho={64} /><p style={{ fontSize: 20, margin: 0 }}>{pinyin}</p></>, base: <Dica rotulo="Ver tradução" texto={meaning.value} /> },
    };
    case "AUDIO_TO_MEANING": return {
      frente: { centro: <BotaoPlay faceta={audioPalavra} texto={word.value} autoTocar={auto && !virada} /> },
      verso: { centro: <><Significado texto={meaning.value} /><p className="v2-cjk v2-sub" style={{ fontSize: 20, margin: 0 }}>{word.value} · {pinyin}</p></> },
    };
    case "WORD_TO_AUDIO": return {
      frente: { centro: <Hanzi texto={word.value} /> },
      verso: { centro: <BotaoPlay faceta={audioPalavra} texto={word.value} autoTocar={auto && virada} />, base: <span className="v2-sub" style={{ fontSize: 17 }}>{pinyin}</span> },
    };
    case "MEANING_TO_SENTENCE": return {
      frente: { centro: <p className="v2-h" style={{ fontSize: 30, fontWeight: 500, margin: 0 }}>{sentence.metadata.translation}</p> },
      verso: { centro: <><Frase sentence={sentence} modo="destaque" /><p className="v2-sub" style={{ fontSize: 16, margin: 0 }}>{sentence.metadata.pinyin}</p></>, base: comAudio && <BotaoOuvirFrase faceta={audioFrase} texto={sentence.value} /> },
    };
    case "SENTENCE_AUDIO_TO_SENTENCE": return {
      frente: {
        centro: <BotaoPlay key={lenta ? "lenta" : "normal"} faceta={audioFrase} texto={sentence.value} lenta={lenta} autoTocar={auto && !virada} />,
        base: (<div className="v2-sg" onClick={parar}><button className={lenta ? "" : "on"} onClick={() => setLenta(false)}>Normal</button><button className={lenta ? "on" : ""} onClick={() => setLenta(true)}>Lenta</button></div>),
      },
      verso: { centro: <><Frase sentence={sentence} modo="destaque" tamanho={28} /><p className="v2-sub" style={{ fontSize: 15, margin: 0 }}>{sentence.metadata.pinyin}</p></>, base: <Dica rotulo="Ver tradução" texto={sentence.metadata.translation} /> },
    };
    case "CLOZE_SENTENCE_TO_WORD": return {
      frente: { centro: <><Frase sentence={sentence} modo="lacuna" /><p className="v2-sub" style={{ fontSize: 17, margin: 0 }}>{sentence.metadata.translation}</p></> },
      verso: { centro: <><Frase sentence={sentence} modo="destaque" /><p className="v2-sub" style={{ fontSize: 16, margin: 0 }}><span className="v2-cjk">{word.value}</span> · {pinyin} · {meaning.value}</p></>, base: comAudio && <BotaoOuvirFrase faceta={audioFrase} texto={sentence.value} /> },
    };
    case "WORD_TO_MEANING": return {
      frente: { centro: <Hanzi texto={word.value} /> },
      verso: { centro: <><Significado texto={meaning.value} /><p className="v2-sub" style={{ fontSize: 16, margin: 0 }}>{word.metadata?.pos}</p></> },
    };
    default: return { frente: { centro: "?" }, verso: { centro: "?" } };
  }
}

// autoTocar=false na prévia: senão as cartas com áudio na frente tocariam todas juntas
// comAudio=false: baralho sem exercícios de áudio; somem também os botões "Ouvir frase" do verso
export default function Carta({ ponte, palavra, virada, aoVirar, autoTocar = true, comAudio = true }) {
  const [lenta, setLenta] = useState(false);
  const f = facetasDe(palavra);
  const { frente, verso } = Faces({ ponte, f, virada, lenta, setLenta, auto: autoTocar, comAudio });
  const instrucao = PONTE[ponte]?.instruction;
  const face = (lado, conteudo, oculta) => (
    <div className={`v2-face ${lado} v2-mc`} aria-hidden={oculta}>
      <span className="v2-chip">{instrucao}</span>
      <div className="v2-mb">{conteudo.centro}</div>
      <div className="v2-bt">{conteudo.base}</div>
    </div>
  );
  return (
    <div className={`v2 v2-cena ${virada ? "virada" : ""}`}>
      <div className="v2-giro" role="button" tabIndex={0} aria-label={virada ? "Voltar para a frente" : "Ver o verso"}
        onClick={aoVirar} onKeyDown={(e) => { if (e.key === "Enter") aoVirar(); }}>
        {face("frente", frente, virada)}
        {face("verso", verso, !virada)}
      </div>
    </div>
  );
}
