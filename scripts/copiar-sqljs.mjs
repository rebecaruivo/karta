// Roda sozinho depois do "npm install" (script postinstall).
// Copia o SQLite em WebAssembly (sql.js) para public/sqljs, de onde o navegador o carrega.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";

const origem = "node_modules/sql.js/dist";
const destino = "public/sqljs";
if (!existsSync(origem)) {
  console.log("[copiar-sqljs] sql.js não instalado ainda; nada a copiar.");
  process.exit(0);
}
mkdirSync(destino, { recursive: true });
for (const arquivo of ["sql-wasm.js", "sql-wasm.wasm"]) copyFileSync(`${origem}/${arquivo}`, `${destino}/${arquivo}`);
console.log("[copiar-sqljs] sql.js copiado para public/sqljs");
