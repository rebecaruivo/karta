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
import {
  idiomaV2, leituraDe, leituraParaExibir, textoParaVoz, generoCurto, classeComGenero,
  tipografiaDe, tamanhoDoAlvo, corpoDaFrase, corpoDoSignificado, corpoDaLeitura,
} from "@/lib/v2/idiomas.js";

const PONTE = Object.fromEntries(CATALOGO_PONTES.map((p) => [p.id, p]));
const parar = (e) => e.stopPropagation(); // clicar num botão não vira a carta

const IconePlay = () => (<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>);
const IconeInfo = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M12 11v5M12 8h.01" /></svg>);
const IconeSom = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>);

// Toca o áudio da faceta conforme o modo escolhido em Configurações:
// gravação do Gemini, voz do navegador, ou gravação com a voz do navegador como reserva.
// "Lenta" toca o MESMO áudio a 0,7× (decisão: não gerar um segundo arquivo).
// Devolve false quando não há som possível (modo "só a cota" sem gravação).
async function tocar(faceta, texto, lenta, aoTerminar, codigoVoz) {
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
  fala.lang = codigoVoz;
  fala.rate = 0.9 * velocidade;
  fala.onend = aoTerminar;
  fala.onerror = aoTerminar;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(fala);
  return true;
}

function BotaoPlay({ faceta, texto, lenta = false, autoTocar = false, codigoVoz }) {
  const [tocando, setTocando] = useState(false);
  const [semSom, setSemSom] = useState(false);
  const play = async () => { setTocando(true); setSemSom(!(await tocar(faceta, texto, lenta, () => setTocando(false), codigoVoz))); };
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

function BotaoOuvirFrase({ faceta, texto, codigoVoz }) {
  return (
    <button className="v2-tb" onClick={(e) => { parar(e); tocar(faceta, texto, false, () => {}, codigoVoz); }}>
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
function Frase({ sentence, modo, cfg }) {
  const chars = Array.from(sentence.value);
  const [ini, fim] = sentence.metadata?.cloze_indices || [0, 0];
  const meio = chars.slice(ini, fim).join("");
  const t = tipografiaDe(cfg);
  // No latim a lacuna acompanha o número de letras; no CJK ela é fixa.
  const largura = cfg.escritaPropria
    ? undefined
    : { width: `${Math.max(2, Array.from(meio.replace(/\s/g, "")).length)}ch` };
  return (
    <p className={`v2-frase ${cfg.escritaPropria ? "v2-cjk" : ""}`} lang={cfg.codigoVoz}
      style={{ fontSize: corpoDaFrase(cfg), fontWeight: t.frase.peso, lineHeight: t.frase.entrelinha, letterSpacing: t.frase.espacamento, margin: 0 }}>
      {chars.slice(0, ini).join("")}
      {modo === "lacuna" ? <span className="v2-bl" aria-label="lacuna" style={largura} /> : <mark>{meio}</mark>}
      {chars.slice(fim).join("")}
    </p>
  );
}

const Escrita = ({ texto, cfg }) => {
  const t = tipografiaDe(cfg);
  return (
    <span className={`v2-alvo ${cfg.escritaPropria ? "v2-cjk" : ""}`} lang={cfg.codigoVoz}
      style={{ fontSize: tamanhoDoAlvo(texto, cfg), fontWeight: t.alvo.peso, lineHeight: t.alvo.entrelinha, letterSpacing: t.alvo.espacamento }}>
      {texto}
    </span>
  );
};
const Significado = ({ texto, cfg }) => (
  <h2 className="v2-h" lang="pt-BR" style={{ margin: 0, fontSize: corpoDoSignificado(cfg), fontWeight: 600, lineHeight: 1.15 }}>{texto}</h2>
);
const Leitura = ({ texto, cfg, frase = false }) => (
  <p className={`v2-sub v2-leitura ${cfg.escritaPropria ? "v2-cjk" : ""}`} lang={cfg.codigoVoz} style={{ fontSize: corpoDaLeitura(cfg, { frase }), lineHeight: 1.3, margin: 0 }}>{texto}</p>
);

function Faces({ ponte, f, virada, lenta, setLenta, auto, comAudio, cfg }) {
  const { word, meaning, sentence, audioPalavra, audioFrase } = f;
  const leitura = leituraParaExibir(leituraDe(word.metadata), cfg);
  const leituraFrase = leituraDe(sentence.metadata);
  const temLeitura = Boolean(leitura);
  const genero = generoCurto(word.metadata); // "f." / "m." em francês e espanhol
  const comGenero = genero ? ` (${genero})` : "";
  const textoPalavra = textoParaVoz(word.value, word.metadata, cfg);
  const textoFrase = textoParaVoz(sentence.value, sentence.metadata, cfg);
  // Nos idiomas latinos o verso não repete o áudio (exceto em Palavra → Áudio,
  // que é o próprio exercício de pronúncia).
  const ouvirFrase = comAudio && cfg.escritaPropria && audioFrase
    ? <BotaoOuvirFrase faceta={audioFrase} texto={textoFrase} codigoVoz={cfg.codigoVoz} />
    : null;
  // Texto em português usa a escala latina, mesmo quando o idioma-alvo é CJK.
  const tPt = tipografiaDe({ escritaPropria: false });
  const estiloPt = { fontSize: corpoDaFrase({ escritaPropria: false }), fontWeight: tPt.frase.peso, lineHeight: tPt.frase.entrelinha, margin: 0 };

  switch (ponte) {
    case "AUDIO_TO_WORD": return {
      frente: { centro: <BotaoPlay faceta={audioPalavra} texto={textoPalavra} autoTocar={auto && !virada} codigoVoz={cfg.codigoVoz} /> },
      verso: { centro: <><Escrita texto={word.value} cfg={cfg} />{temLeitura && <Leitura texto={leitura} cfg={cfg} />}</>, base: <Dica rotulo="Ver tradução" texto={meaning.value} /> },
    };
    case "AUDIO_TO_MEANING": return {
      frente: { centro: <BotaoPlay faceta={audioPalavra} texto={textoPalavra} autoTocar={auto && !virada} codigoVoz={cfg.codigoVoz} /> },
      verso: { centro: <><Significado texto={meaning.value} cfg={cfg} /><p className={`v2-sub ${cfg.escritaPropria ? "v2-cjk" : ""}`} lang={cfg.codigoVoz} style={{ fontSize: corpoDaLeitura(cfg), margin: 0 }}>{word.value}{comGenero}{temLeitura ? ` · ${leitura}` : ""}</p></> },
    };
    case "WORD_TO_AUDIO": return {
      frente: { centro: <Escrita texto={word.value} cfg={cfg} /> },
      // O botão de áudio não se repete embaixo, mas a leitura sim: é como conferir a pronúncia por escrito
      // (o catálogo de pontes prevê a leitura no verso desta carta).
      verso: { centro: <BotaoPlay faceta={audioPalavra} texto={textoPalavra} autoTocar={auto && virada} codigoVoz={cfg.codigoVoz} />, base: temLeitura ? <Leitura texto={leitura} cfg={cfg} /> : null },
    };
    case "MEANING_TO_SENTENCE": return {
      frente: { centro: <p className="v2-frase-pt" lang="pt-BR" style={{ ...estiloPt, textWrap: "balance" }}>{sentence.metadata.translation}</p> },
      verso: { centro: <><Frase sentence={sentence} modo="destaque" cfg={cfg} />{leituraFrase && <Leitura texto={leituraFrase} cfg={cfg} frase />}</>, base: ouvirFrase },
    };
    case "SENTENCE_AUDIO_TO_SENTENCE": return {
      frente: {
        centro: <BotaoPlay key={lenta ? "lenta" : "normal"} faceta={audioFrase} texto={textoFrase} lenta={lenta} autoTocar={auto && !virada} codigoVoz={cfg.codigoVoz} />,
        base: (<div className="v2-sg" onClick={parar}><button className={lenta ? "" : "on"} onClick={() => setLenta(false)}>Normal</button><button className={lenta ? "on" : ""} onClick={() => setLenta(true)}>Lenta</button></div>),
      },
      verso: { centro: <><Frase sentence={sentence} modo="destaque" cfg={cfg} />{leituraFrase && <Leitura texto={leituraFrase} cfg={cfg} frase />}</>, base: <Dica rotulo="Ver tradução" texto={sentence.metadata.translation} /> },
    };
    case "CLOZE_SENTENCE_TO_WORD": return {
      frente: { centro: <><Frase sentence={sentence} modo="lacuna" cfg={cfg} /><p className="v2-sub" lang="pt-BR" style={{ fontSize: corpoDaLeitura(cfg), margin: 0 }}>{sentence.metadata.translation}</p></> },
      verso: { centro: <><Frase sentence={sentence} modo="destaque" cfg={cfg} /><p className={`v2-sub ${cfg.escritaPropria ? "v2-cjk" : ""}`} lang="pt-BR" style={{ fontSize: corpoDaLeitura(cfg), margin: 0 }}><span lang={cfg.codigoVoz} style={{ fontWeight: tipografiaDe(cfg).alvo.peso }}>{word.value}</span>{comGenero}{temLeitura ? ` · ${leitura}` : ""} · {meaning.value}</p></>, base: ouvirFrase },
    };
    case "WORD_TO_MEANING": return {
      frente: { centro: <Escrita texto={word.value} cfg={cfg} /> },
      verso: { centro: <><Significado texto={meaning.value} cfg={cfg} /><p className="v2-sub" lang="pt-BR" style={{ fontSize: 16, margin: 0 }}>{classeComGenero(word.metadata)}</p></> },
    };
    default: return { frente: { centro: "?" }, verso: { centro: "?" } };
  }
}

// autoTocar=false na prévia: senão as cartas com áudio na frente tocariam todas juntas
// comAudio=false: baralho sem exercícios de áudio; somem também os botões "Ouvir frase" do verso
export default function Carta({ ponte, palavra, virada, aoVirar, autoTocar = true, comAudio = true }) {
  const [lenta, setLenta] = useState(false);
  const cfg = idiomaV2(palavra.concept.language);
  const f = facetasDe(palavra);
  const { frente, verso } = Faces({ ponte, f, virada, lenta, setLenta, auto: autoTocar, comAudio, cfg });
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
