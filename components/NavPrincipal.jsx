"use client";
// Navegação principal. No computador, links no topo; no celular, uma barra fixa embaixo
// (ao alcance do polegar), que some durante o estudo para a carta ter a tela toda.
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONES = {
  baralhos: <><rect x="4" y="6" width="13" height="15" rx="2.5" /><path d="M8 3h9.5A2.5 2.5 0 0 1 20 5.5V17" /></>,
  progresso: <><path d="M5 20V12" /><path d="M12 20V5" /><path d="M19 20v-6" /></>,
  ajustes: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M4.2 6.5l2.6 1.5M17.2 16l2.6 1.5M4.2 17.5l2.6-1.5M17.2 8l2.6-1.5" /></>,
};

const ITENS = [
  { href: "/", rotulo: "Baralhos", icone: "baralhos", ativo: (p) => p === "/" || p.startsWith("/baralho") || p.startsWith("/novo") },
  { href: "/progresso", rotulo: "Progresso", icone: "progresso", ativo: (p) => p.startsWith("/progresso") },
  { href: "/configuracoes", rotulo: "Configurações", curto: "Ajustes", icone: "ajustes", ativo: (p) => p.startsWith("/configuracoes") },
];

// Links do topo (escondidos no celular pelo CSS)
export function NavTopo() {
  const caminho = usePathname() ?? "/";
  return ITENS.map((i) => (
    <Link key={i.href} href={i.href} className="nav-topo-link" aria-current={i.ativo(caminho) ? "page" : undefined}>{i.rotulo}</Link>
  ));
}

// Barra de baixo (só aparece no celular, pelo CSS)
export default function NavInferior() {
  const caminho = usePathname() ?? "/";
  if (caminho.startsWith("/estudar")) return null;
  return (
    <nav className="nav-inf" aria-label="Navegação principal">
      {ITENS.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.ativo(caminho) ? "page" : undefined}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONES[i.icone]}</svg>
          <span>{i.curto ?? i.rotulo}</span>
        </Link>
      ))}
    </nav>
  );
}
