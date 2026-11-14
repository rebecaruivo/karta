import "./globals.css";
import Link from "next/link";

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
          href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Outfit:wght@500;700&family=Noto+Serif+SC:wght@500;700&display=swap"
        />
      </head>
      <body>
        <header className="topo">
          <Link href="/" className="marca d">Karta</Link>
          <nav style={{ display: "flex", gap: 20 }}><Link href="/">Biblioteca</Link><Link href="/configuracoes">Configurações</Link></nav>
        </header>
        <main className="conteudo">{children}</main>
      </body>
    </html>
  );
}
