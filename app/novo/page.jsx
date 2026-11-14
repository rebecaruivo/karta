"use client";
// Tela "Novo baralho": formulário -> /api/gerar -> salva -> abre o baralho
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IDIOMAS, LIMITE_CARTAS } from "@/lib/idiomas";
import { salvarBaralho } from "@/lib/armazenamento";
import { cabecalhosComChave } from "@/lib/chave";
import Link from "next/link";

const SUGESTOES = ["Comida", "Viagem", "Trabalho", "Cumprimentos", "Casa", "Saúde"];

export default function NovoBaralho() {
  const router = useRouter();
  const [idioma, setIdioma] = useState("mandarim");
  const [nivel, setNivel] = useState("HSK 1");
  const [tema, setTema] = useState("");
  const [quantidade, setQuantidade] = useState(15);
  const [gerando, setGerando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState(null);
  const [semChave, setSemChave] = useState(false);

  // Cronômetro honesto: mostra quanto tempo passou, sem barra de progresso falsa
  useEffect(() => {
    if (!gerando) return;
    setSegundos(0);
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gerando]);

  function trocarIdioma(novo) {
    setIdioma(novo);
    setNivel(IDIOMAS[novo].niveis[0]);
  }

  async function gerar(e) {
    e.preventDefault();
    setErro(null);
    setGerando(true);
    try {
      const resp = await fetch("/api/gerar", {
        method: "POST",
        headers: cabecalhosComChave(),
        body: JSON.stringify({ idioma, nivel, tema: tema.trim(), quantidade: Number(quantidade) }),
      });
      const dados = await resp.json();
      setSemChave(dados.codigo === "sem-chave");
      if (!resp.ok) throw new Error([dados.erro || "Erro desconhecido.", dados.detalhe].filter(Boolean).join("\n\nDetalhe técnico: "));

      const baralho = {
        id: crypto.randomUUID(),
        idioma,
        nivel,
        tema: tema.trim(),
        criadoEm: new Date().toISOString(),
        modelo: dados.modelo,
        observacao: dados.observacao,
        cartas: dados.cartas.map((c) => ({ ...c, id: crypto.randomUUID(), status: "nova" })),
      };
      salvarBaralho(baralho);
      router.push(`/baralho/${baralho.id}`);
    } catch (err) {
      setErro(err.message);
      setGerando(false);
    }
  }

  if (gerando) {
    return (
      <>
        <h1>Gerando baralho</h1>
        <p className="mu" style={{ marginBottom: 24 }}>
          {IDIOMAS[idioma].nome} · {nivel} · {tema} · {quantidade} cartas
        </p>
        <ul className="etapas">
          <li className="feito">Pedido conferido</li>
          <li>Gemini escrevendo as cartas… {segundos}s</li>
          <li>Conferir repetições e campos vazios</li>
        </ul>
        <p className="mu">Costuma levar de 10 a 30 segundos.</p>
      </>
    );
  }

  return (
    <>
      <h1>Novo baralho</h1>
      <p className="mu" style={{ marginBottom: 28 }}>A IA escolhe as palavras, a pronúncia e uma frase de exemplo para cada carta.</p>

      <form className="form" onSubmit={gerar}>
        <div>
          <span className="lb">Idioma</span>
          <div className="chips">
            {Object.entries(IDIOMAS).map(([chave, cfg]) => (
              <button type="button" key={chave} className={`ch ${idioma === chave ? "on" : ""}`} onClick={() => trocarIdioma(chave)}>
                {cfg.nome}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="lb">Nível</span>
          <div className="chips">
            {IDIOMAS[idioma].niveis.map((n) => (
              <button type="button" key={n} className={`ch ${nivel === n ? "on" : ""}`} onClick={() => setNivel(n)}>{n}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="lb" htmlFor="tema">Tema</label>
          <input id="tema" className="fi" value={tema} onChange={(e) => setTema(e.target.value)}
            placeholder="Ex.: pedir comida num restaurante" maxLength={80} required minLength={2} />
          <div className="chips" style={{ marginTop: 10 }}>
            {SUGESTOES.map((s) => (
              <button type="button" key={s} className="ch" onClick={() => setTema(s)}>{s}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="lb" htmlFor="qtd">Quantidade de cartas: {quantidade}</label>
          <input id="qtd" type="range" min={5} max={LIMITE_CARTAS} value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)} style={{ width: "100%" }} />
        </div>

        {erro && (
          <div className="erro" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {erro}
            {semChave && <div style={{ marginTop: 10 }}><Link href="/configuracoes" className="btn">Colar minha chave</Link></div>}
          </div>
        )}

        <div><button className="btn" type="submit">Gerar baralho</button></div>
      </form>
    </>
  );
}
