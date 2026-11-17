"use client";
// Entrar ou criar conta: Google ou e-mail e senha.
// Sem conta, o Karta continua funcionando: os baralhos ficam neste navegador.
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";

export default function Entrar() {
  const [modo, setModo] = useState("entrar"); // "entrar" | "criar"
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function comGoogle() {
    setErro(null);
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: window.location.origin });
    if (error) setErro(error.message || "Não consegui abrir o login do Google.");
  }

  async function comEmail(e) {
    e.preventDefault();
    setErro(null); setEnviando(true);
    const r = modo === "criar"
      ? await authClient.signUp.email({ name: nome.trim() || email.split("@")[0], email: email.trim(), password: senha })
      : await authClient.signIn.email({ email: email.trim(), password: senha });
    setEnviando(false);
    if (r.error) return setErro(traduzir(r.error.message, modo));
    window.location.href = "/";
  }

  return (
    <div className="v2" style={{ maxWidth: 420, margin: "24px auto" }}>
      <h1 style={{ marginBottom: 8 }}>{modo === "criar" ? "Criar conta" : "Entrar"}</h1>
      <p className="mu" style={{ marginBottom: 24 }}>
        Com uma conta, seus baralhos e o progresso de estudo ficam salvos e aparecem em qualquer aparelho.
        Sem conta, o Karta funciona do mesmo jeito, com os baralhos guardados neste navegador.
      </p>

      <button className="bo" style={{ width: "100%" }} onClick={comGoogle}>Continuar com Google</button>

      <p className="mu" style={{ textAlign: "center", margin: "18px 0" }}>ou com e-mail</p>

      <form className="form" onSubmit={comEmail} style={{ gap: 14 }}>
        {modo === "criar" && (
          <label style={{ display: "grid", gap: 4 }}><span className="lb" style={{ margin: 0 }}>Nome</span>
            <input className="fi v2-fi" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={60} /></label>
        )}
        <label style={{ display: "grid", gap: 4 }}><span className="lb" style={{ margin: 0 }}>E-mail</span>
          <input className="fi v2-fi" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label style={{ display: "grid", gap: 4 }}><span className="lb" style={{ margin: 0 }}>Senha</span>
          <input className="fi v2-fi" type="password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)}
            autoComplete={modo === "criar" ? "new-password" : "current-password"} /></label>
        {erro && <p className="erro" style={{ margin: 0 }}>{erro}</p>}
        <button className="btn" type="submit" disabled={enviando}>{enviando ? "Aguarde…" : modo === "criar" ? "Criar conta" : "Entrar"}</button>
      </form>

      <p style={{ marginTop: 20 }}>
        {modo === "criar"
          ? <>Já tem conta? <button className="v2-link" onClick={() => { setModo("entrar"); setErro(null); }}>Entrar</button></>
          : <>Ainda não tem conta? <button className="v2-link" onClick={() => { setModo("criar"); setErro(null); }}>Criar conta</button></>}
      </p>
      <p><Link href="/" className="mu">Continuar sem conta</Link></p>
    </div>
  );
}

// Mensagens do serviço de login, em português
function traduzir(msg = "", modo) {
  const m = msg.toLowerCase();
  if (m.includes("invalid") && m.includes("password")) return "E-mail ou senha incorretos.";
  if (m.includes("already") || m.includes("exists")) return "Já existe uma conta com esse e-mail. Use \"Entrar\".";
  if (m.includes("password") && (m.includes("short") || m.includes("least"))) return "A senha precisa ter pelo menos 8 caracteres.";
  return msg || (modo === "criar" ? "Não consegui criar a conta." : "Não consegui entrar.");
}
