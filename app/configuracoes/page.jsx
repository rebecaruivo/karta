"use client";
// Configurações: chave do Gemini do visitante
import { useEffect, useState } from "react";
import { obterChave, salvarChave, removerChave } from "@/lib/chave";
import { MODOS_AUDIO, obterModoAudio, salvarModoAudio } from "@/lib/preferencias";

export default function Configuracoes() {
  const [valor, setValor] = useState("");
  const [salva, setSalva] = useState("");
  const [mensagem, setMensagem] = useState(null);
  const [modoAudio, setModoAudio] = useState(null);

  useEffect(() => { setSalva(obterChave()); setModoAudio(obterModoAudio()); }, []);

  function escolherModo(m) { salvarModoAudio(m); setModoAudio(m); }

  function salvar(e) {
    e.preventDefault();
    if (!valor.trim()) return;
    salvarChave(valor);
    setSalva(valor.trim());
    setValor("");
    setMensagem("Chave salva neste navegador.");
  }
  function remover() {
    removerChave();
    setSalva("");
    setMensagem("Chave removida deste navegador.");
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <h1>Configurações</h1>
      <p className="mu" style={{ marginBottom: 24 }}>
        Para gerar baralhos e áudios, o Karta usa a sua própria chave do Gemini. Ela é grátis e leva um minuto para criar.
      </p>

      <ol className="aviso" style={{ paddingLeft: 36, lineHeight: 1.7, marginBottom: 24 }}>
        <li>Abra <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer"><strong>aistudio.google.com/apikey</strong></a> com sua conta Google.</li>
        <li>Clique em <strong>Create API key</strong> e copie a chave.</li>
        <li>Cole abaixo e salve.</li>
      </ol>

      {salva ? (
        <div className="aviso" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>Chave salva: <code>{salva.slice(0, 4)}…{salva.slice(-2)}</code></span>
          <button className="bo" onClick={remover}>Remover</button>
        </div>
      ) : null}

      <form className="form" onSubmit={salvar}>
        <div>
          <label className="lb" htmlFor="chave">{salva ? "Trocar chave" : "Sua chave do Gemini"}</label>
          <input id="chave" className="fi" type="password" autoComplete="off" value={valor}
            onChange={(e) => setValor(e.target.value)} placeholder="Cole aqui a chave" />
        </div>
        <div><button className="btn" type="submit">Salvar chave</button></div>
      </form>
      {mensagem && <p className="mu" style={{ marginTop: 12 }}>{mensagem}</p>}

      <h2 className="d" style={{ fontSize: 20, marginTop: 36 }}>Áudio das cartas</h2>
      <p className="mu" style={{ marginTop: 0 }}>De onde vem a voz que lê as palavras e as frases.</p>
      <div style={{ display: "grid", gap: 10 }} role="radiogroup" aria-label="Modo de áudio">
        {Object.entries(MODOS_AUDIO).map(([m, { rotulo, descricao }]) => (
          <label key={m} className="aviso" style={{ display: "flex", gap: 12, cursor: "pointer", outline: modoAudio === m ? "2px solid var(--tinta)" : "none" }}>
            <input type="radio" name="modo-audio" checked={modoAudio === m} onChange={() => escolherModo(m)} style={{ marginTop: 4 }} />
            <span><strong>{rotulo}</strong><br /><span className="mu">{descricao}</span></span>
          </label>
        ))}
      </div>

      <h2 className="d" style={{ fontSize: 20, marginTop: 36 }}>Como a chave é usada</h2>
      <ul className="mu" style={{ lineHeight: 1.7 }}>
        <li>Fica guardada <strong>só neste navegador</strong> (localStorage). Não vai para nenhum banco de dados.</li>
        <li>Em cada geração, ela segue junto com o pedido para o servidor do Karta, que a repassa ao Gemini e não a armazena.</li>
        <li>O uso conta na <strong>sua</strong> cota gratuita do Gemini.</li>
        <li>Use <strong>Remover</strong> para apagá-la a qualquer momento.</li>
      </ul>
    </div>
  );
}
