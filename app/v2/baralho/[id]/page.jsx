"use client";
// v2 · Tela do baralho: palavras, alertas da IA e prévia das 7 cartas de cada palavra
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { obterRepo, facetasDe } from "@/lib/v2/cliente";
import { montarFila } from "@/lib/v2/sessao";
import Carta from "@/components/v2/Carta";
import { gerarAudiosDoBaralho } from "@/lib/v2/gerarAudios";
import { obterModoAudio, podeGerarAudio } from "@/lib/preferencias";

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

  const carregar = async () => {
    const repo = await obterRepo();
    setDados(await repo.carregarBaralho(id));
    setPendentes((await repo.audiosPendentes(id)).length);
  };
  useEffect(() => { carregar(); setModoAudio(obterModoAudio()); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (dados === undefined) return null;
  if (dados === null) return <p>Baralho não encontrado. <Link href="/v2">Voltar</Link></p>;

  const { deck, palavras, cartas } = dados;
  const paraEstudar = montarFila(cartas).length;
  const comAudio = (deck.facetas_opcionais ?? ["AUDIO"]).includes("AUDIO");

  async function gerarAudios() {
    setAvisoAudio(null);
    const r = await gerarAudiosDoBaralho(await obterRepo(), deck.id, ({ feitos, total }) => setGerando(`${feitos} de ${total}`));
    setGerando(null);
    if (r.parou) setAvisoAudio(`${r.parou} ${r.feitos} gravações foram salvas; o resto continua de onde parou.`);
    else if (r.falhas) setAvisoAudio(`${r.falhas} gravações falharam. Clique de novo para tentar.`);
    carregar();
  }

  async function excluirPalavra(conceptId) {
    const n = cartas.filter((c) => c.concept_id === conceptId).length;
    if (!window.confirm(`Excluir esta palavra e as ${n} cartas dela?`)) return;
    await (await obterRepo()).excluirPalavra(conceptId);
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
        <div className="acoes"><Link href={`/v2/estudar/${deck.id}`} className="btn">Estudar ({paraEstudar})</Link></div>
      </div>

      {comAudio && podeGerarAudio(modoAudio) && (pendentes > 0 || gerando) && (
        <div className="aviso painel-audio">
          <div>
            <strong>{gerando ? `Gerando gravações com o Gemini… ${gerando}` : `${pendentes} gravações por gerar`}</strong>
            <p className="mu" style={{ margin: "4px 0 0" }}>Primeiro a pronúncia das palavras, depois a das frases.{modoAudio === "cota_e_navegador" && " Enquanto isso, as cartas usam a voz do navegador."}</p>
          </div>
          <button className="btn" onClick={gerarAudios} disabled={!!gerando}>{gerando ? "Gerando…" : "Gerar áudios"}</button>
        </div>
      )}
      {avisoAudio && <div className="erro" style={{ marginBottom: 20 }}>{avisoAudio}</div>}
      {!comAudio && <p className="mu" style={{ marginBottom: 16 }}>Baralho sem exercícios de áudio: 3 cartas por palavra.</p>}

      <div className="lr lh"><span>Palavra</span><span>Pinyin</span><span>Significado e frase</span><span></span></div>
      {palavras.map((p) => {
        const { word, meaning, sentence } = facetasDe(p);
        const cartasDaPalavra = cartas.filter((c) => c.concept_id === p.concept.id);
        const alertas = [
          meaning?.metadata?.ambiguous && `também pode ser: ${meaning.metadata.other_senses}`,
          word?.metadata?.level_fit === false && "acima do nível",
        ].filter(Boolean);
        return (
          <div key={p.concept.id}>
            <div className="lr">
              <span className="pal v2-cjk">{word?.value}</span>
              <span className="mu" style={{ fontSize: 15 }}>{word?.metadata?.pinyin}</span>
              <span>
                <strong>{meaning?.value}</strong> <span className="mu">· {word?.metadata?.pos} · você digitou "{p.concept.gloss}"</span><br />
                <span className="mu v2-cjk">{sentence?.value}</span> <span className="mu">— {sentence?.metadata?.translation}</span>
                {alertas.length > 0 && <><br /><span className="mu" style={{ fontSize: 13 }}>⚠ {alertas.join(" · ")}</span></>}
              </span>
              <span style={{ display: "grid", gap: 6, justifyItems: "start" }}>
                <button className="ch" onClick={() => setAberta(aberta === p.concept.id ? null : p.concept.id)}>
                  {aberta === p.concept.id ? "Fechar" : `Ver as ${cartasDaPalavra.length} cartas`}
                </button>
                <button className="ch" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => excluirPalavra(p.concept.id)}>Excluir</button>
              </span>
            </div>
            {aberta === p.concept.id && <Previa palavra={p} cartas={cartasDaPalavra} comAudio={comAudio} />}
          </div>
        );
      })}

      <p style={{ marginTop: 32 }}><button className="bo" onClick={excluirBaralho}>Excluir baralho</button></p>
      {deck.modelo && <p className="mu">Facetas geradas com {deck.modelo} · prompt v{deck.versao_prompt}</p>}
    </>
  );
}
