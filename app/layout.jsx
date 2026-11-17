import "./globals.css";
import "./v2/v2.css"; // estilos compartilhados (links de texto, campos compactos) também fora da v2
import Link from "next/link";
import MenuConta from "@/components/MenuConta";
import { authLigado } from "@/lib/auth/server";

export const metadata = {
  title: "Karta",
  description: "Baralhos de flashcards de idiomas gerados com IA",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Outfit:wght@500;700&family=Noto+Serif+SC:wght@500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <header className="topo">
          <Link href="/" className="marca d">Karta</Link>
          <nav style={{ display: "flex", gap: 20, alignItems: "center" }}><Link href="/">Biblioteca</Link><Link href="/v2">Cartas por conexão <span className="tg" style={{ fontSize: 10, padding: "2px 7px" }}>beta</span></Link><Link href="/configuracoes">Configurações</Link><MenuConta ligado={authLigado} /></nav>
        </header>
        <main className="conteudo">{children}</main>
      </body>
    </html>
  );
}
