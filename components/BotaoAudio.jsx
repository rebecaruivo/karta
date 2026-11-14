"use client";
// Botão de ouvir. Toca o áudio do Gemini salvo no navegador.
// Se não houver áudio salvo (ou ele falhar), usa a voz do próprio
// navegador (Web Speech API): pior qualidade, mas a carta nunca fica muda.
import { useEffect, useState } from "react";
import { obterAudio } from "@/lib/audios";

export default function BotaoAudio({ chave, texto, codigoVoz, rotulo = "Ouvir", autoTocar = false }) {
  const [tocando, setTocando] = useState(false);
  const [fonte, setFonte] = useState(null); // "gemini" | "navegador"

  async function tocar() {
    setTocando(true);
    try {
      const blob = await obterAudio(chave);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { URL.revokeObjectURL(url); setTocando(false); };
        await audio.play();
        setFonte("gemini");
        return;
      }
    } catch {
      // segue para o plano B
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const fala = new SpeechSynthesisUtterance(texto);
      fala.lang = codigoVoz;
      fala.rate = 0.85; // um pouco mais devagar: é para quem está aprendendo
      fala.onend = () => setTocando(false);
      fala.onerror = () => setTocando(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(fala);
      setFonte("navegador");
    } else {
      setTocando(false);
    }
  }

  useEffect(() => {
    if (autoTocar) tocar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, autoTocar]);

  return (
    <button
      type="button"
      className={`ch audio ${tocando ? "on" : ""}`}
      onClick={tocar}
      title={fonte === "navegador" ? "Voz do navegador (áudio do Gemini ainda não gerado)" : "Ouvir"}
    >
      {tocando ? "■" : "▶"} {rotulo}
      {fonte === "navegador" && <span className="mu" style={{ fontSize: 11 }}> · voz do navegador</span>}
    </button>
  );
}
