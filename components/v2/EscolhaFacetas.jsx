"use client";
// Escolha das facetas opcionais de um baralho (usada em Configurações e na criação).
// Palavra e significado são obrigatórios; frase e áudio podem ser desligados.
import { cartasPorPalavra } from "@/lib/v2/pontes";

export const OPCOES_FACETAS = [
  { tipo: "SENTENCE", rotulo: "Frase de exemplo", descricao: "Cartas de tradução da frase e de completar a lacuna." },
  { tipo: "AUDIO", rotulo: "Áudio", descricao: "Cartas de escuta e de pronúncia, e o botão “Ouvir frase”." },
];

export function resumoFacetas(facetas) {
  const n = cartasPorPalavra(facetas);
  return n === 1 ? "1 carta por palavra: só Palavra → Significado." : `${n} cartas por palavra.`;
}

export default function EscolhaFacetas({ facetas, aoMudar, desabilitado = false }) {
  const alternar = (tipo) => aoMudar(facetas.includes(tipo) ? facetas.filter((t) => t !== tipo) : [...facetas, tipo]);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {OPCOES_FACETAS.map((o) => (
        <label key={o.tipo} className="aviso" style={{ display: "flex", gap: 12, cursor: desabilitado ? "default" : "pointer" }}>
          <input type="checkbox" checked={facetas.includes(o.tipo)} onChange={() => alternar(o.tipo)} disabled={desabilitado} style={{ marginTop: 4 }} />
          <span><strong>{o.rotulo}</strong><br /><span className="mu">{o.descricao}</span></span>
        </label>
      ))}
      <p className="mu" style={{ margin: 0, fontSize: 13 }}>Palavra e significado estão sempre incluídos. {resumoFacetas(facetas)}</p>
    </div>
  );
}
