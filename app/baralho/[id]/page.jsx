"use client";
// Tela do baralho: resumo, geração de áudio e lista de cartas
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { obterBaralho, excluirBaralho } from "@/lib/armazenamento";
import { IDIOMAS } from "@/lib/idiomas";
import { paraRevisar } from "@/lib/repeticao";
import { apagarAudios, chaveAudio } from "@/lib/audios";
import { gerarAudiosDoBaralho, audiosFaltando } from "@/lib/gerarAudios";
import BotaoAudio from "@/components/BotaoAudio";

const ROTULO_STATUS = { nova: "Nova", aprendendo: "Em aprendizado", dominada: "Dominada" };
const ROTULO_AUDIO = { gerando: "Gerando áudio…", pronto: "Áudio pronto", falhou: "Áudio falhou" };

export default function Baralho() {
  const { id } = useParams();
  const router = useRouter();
  const [baralho, setBaralho] = useState(undefined);
  const [filtro, setFiltro] = useState("todas");
  const [gerando, setGerando] = useState(false);
  const [estadoCarta, setEstadoCarta] = useState({});
  const [aviso, setAviso] = useState(null);

  useEffect(() => setBaralho(obterBaralho(id)), [id]);

  if (baralho === undefined) return null;
  if (baralho === null) return <p>Baralho não encontrado. <Link href="/">Voltar</Link></p>;

  const cfg = IDIOMAS[baralho.idioma];
  const contar = (s) => baralho.cartas.filter((c) => c.status === s).length;
  const paraHoje = baralho.cartas.filter((c) => paraRevisar(c)).length;
  const faltam = audiosFaltando(baralho);
  const visiveis = filtro === "todas" ? baralho.cartas : baralho.cartas.filter((c) => c.status === filtro);

  async function gerarAudios() {
    setGerando(true);
    setAviso(null);
    const r = await gerarAudiosDoBaralho(baralho, (atual, { cartaId, estado }) => {
      setBaralho(atual);
      setEstadoCarta((e) => ({ ...e, [cartaId]: estado }));
    });
    setBaralho(r.baralho);
    setGerando(false);
    if (r.parouPorLimite) setAviso(r.erro);
    else if (r.falhas) setAviso(`${r.falhas} carta(s) ficaram sem áudio. Clique em "Tentar de novo".`);
  }

  async function excluir() {
    if (!window.confirm("Excluir este baralho? Não dá para desfazer.")) return;
    await apagarAudios(baralho.cartas.flatMap((c) => [chaveAudio(c.id, "palavra"), chaveAudio(c.id, "exemplo")])).catch(() => {});
    excluirBaralho(baralho.id);
    router.push("/");
  }

  return (
    <>
      <Link href="/" className="mu">← Biblioteca</Link>
      <div className="cabecalho" style={{ marginTop: 12 }}>
        <div>
          <h1><span className="z">{cfg.sigla}</span> {baralho.tema}</h1>
          <p className="mu">{cfg.nome} · {baralho.nivel} · {baralho.cartas.length} cartas</p>
        </div>
        <div className="acoes">
          <Link href={`/baralho/${baralho.id}/estudar`} className="btn">Estudar ({paraHoje})</Link>
          <button className="bo" disabled title="Chega na próxima fase">Exportar .apkg</button>
        </div>
      </div>

      {baralho.observacao && <p className="aviso" style={{ marginBottom: 20 }}>{baralho.observacao}</p>}

      {(faltam > 0 || gerando) && (
        <div className="aviso painel-audio">
          <div>
            <strong>{gerando ? "Gerando áudios com o Gemini…" : `${faltam} áudios por gerar`}</strong>
            <p className="mu" style={{ margin: "4px 0 0" }}>
              {gerando
                ? "Uma carta por vez. Pode sair desta tela: o que já foi gerado fica salvo."
                : "Pronúncia da palavra e da frase de exemplo. Sem áudio, as cartas usam a voz do navegador."}
            </p>
          </div>
          <button className="btn" onClick={gerarAudios} disabled={gerando}>
            {gerando ? "Gerando…" : Object.values(estadoCarta).includes("falhou") ? "Tentar de novo" : "Gerar áudios"}
          </button>
        </div>
      )}
      {aviso && <div className="erro" style={{ marginBottom: 20 }}>{aviso}</div>}

      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`ch ${filtro === "todas" ? "on" : ""}`} onClick={() => setFiltro("todas")}>Todas</button>
        {Object.entries(ROTULO_STATUS).map(([s, r]) => (
          <button key={s} className={`ch ${filtro === s ? "on" : ""}`} onClick={() => setFiltro(s)}>
            {r} ({contar(s)})
          </button>
        ))}
      </div>

      <div className="lr lh"><span>Palavra</span><span>{cfg.rotuloLeitura}</span><span>Tradução e exemplo</span><span>Status</span></div>
      {visiveis.map((c) => (
        <div className="lr" key={c.id}>
          <span className="pal z">{c.palavra}</span>
          <span className="mu" style={{ fontSize: 15 }}>
            {c.leitura}
            <br />
            <BotaoAudio chave={chaveAudio(c.id, "palavra")} texto={c.palavra} codigoVoz={cfg.codigoVoz} />
          </span>
          <span>
            <strong>{c.traducao}</strong> <span className="mu">· {c.classe}</span><br />
            <span className="mu">{c.exemplo} — {c.exemploTraducao}</span>
          </span>
          <span style={{ display: "grid", gap: 6, justifyItems: "start" }}>
            <span className="tg">{ROTULO_STATUS[c.status]}</span>
            {estadoCarta[c.id] && <span className={`cp ${estadoCarta[c.id] === "falhou" ? "er" : ""}`}>{ROTULO_AUDIO[estadoCarta[c.id]]}</span>}
          </span>
        </div>
      ))}

      <p style={{ marginTop: 32 }}><button className="bo" onClick={excluir}>Excluir baralho</button></p>
      <p className="mu">Texto gerado com {baralho.modelo}</p>
    </>
  );
}
