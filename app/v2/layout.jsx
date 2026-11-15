import "./v2.css";
import Link from "next/link";

export const metadata = { title: "Karta v2 · cartas por conexão" };

export default function LayoutV2({ children }) {
  return (
    <div className="v2">
      <p className="mu" style={{ margin: "0 0 20px", fontSize: 13 }}>
        <strong>Versão 2 (beta)</strong> · cartas por conexão · <Link href="/v2" style={{ textDecoration: "underline" }}>baralhos da v2</Link> · <Link href="/" style={{ textDecoration: "underline" }}>voltar para a v1</Link>
      </p>
      {children}
    </div>
  );
}
