// ─────────────────────────────────────────────────────────────
// ADAPTADORES DE ARMAZENAMENTO (v2)
// O repositório (banco.js) não sabe onde os dados ficam. Ele fala com um
// adaptador que oferece sempre as mesmas operações:
//   obter(tabela, id) · todos(tabela) · porIndice(tabela, indice, valor)
//   salvar(tabela, registros[]) · remover(tabela, ids[])
// - indexedDB: o de verdade, no navegador
// - memoria: para os testes no Node (o IndexedDB não existe fora do navegador)
// ─────────────────────────────────────────────────────────────

// Tabelas da modelagem de dados (CauanGS) + "decks" (documento de arquitetura)
// + "arquivos" (os áudios em si; a faceta AUDIO aponta para eles).
// Sem tabela de usuários: cada navegador é de uma pessoa só.
export const ESQUEMA = {
  decks: [],
  concepts: ["deck_id"],
  facets: ["concept_id"],
  bridge_templates: [],
  user_cards: ["concept_id", "deck_id"],
  arquivos: [],
};

export function adaptadorMemoria() {
  const dados = Object.fromEntries(Object.keys(ESQUEMA).map((t) => [t, new Map()]));
  const copia = (x) => structuredClone(x); // devolve cópias, como o IndexedDB faz
  return {
    async obter(t, id) { const r = dados[t].get(id); return r === undefined ? undefined : copia(r); },
    async todos(t) { return [...dados[t].values()].map(copia); },
    async porIndice(t, indice, valor) { return [...dados[t].values()].filter((r) => r[indice] === valor).map(copia); },
    async salvar(t, registros) { for (const r of registros) dados[t].set(r.id, copia(r)); },
    async remover(t, ids) { for (const id of ids) dados[t].delete(id); },
  };
}

export function adaptadorIndexedDB(nome = "karta-v2", fabrica = globalThis.indexedDB) {
  const abrir = new Promise((ok, falha) => {
    const pedido = fabrica.open(nome, 1);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      for (const [tabela, indices] of Object.entries(ESQUEMA)) {
        if (db.objectStoreNames.contains(tabela)) continue;
        const loja = db.createObjectStore(tabela, { keyPath: "id" });
        for (const i of indices) loja.createIndex(i, i);
      }
    };
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => falha(pedido.error);
  });
  // Executa uma operação numa transação e devolve o resultado quando ela termina
  async function transacao(tabela, modo, operacao) {
    const db = await abrir;
    return new Promise((ok, falha) => {
      const t = db.transaction(tabela, modo);
      const loja = t.objectStore(tabela);
      const pedido = operacao(loja);
      t.oncomplete = () => ok(pedido?.result);
      t.onerror = () => falha(t.error);
      t.onabort = () => falha(t.error);
    });
  }
  return {
    obter: (t, id) => transacao(t, "readonly", (l) => l.get(id)),
    todos: (t) => transacao(t, "readonly", (l) => l.getAll()),
    porIndice: (t, indice, valor) => transacao(t, "readonly", (l) => l.index(indice).getAll(valor)),
    salvar: (t, registros) => transacao(t, "readwrite", (l) => { registros.forEach((r) => l.put(r)); }),
    remover: (t, ids) => transacao(t, "readwrite", (l) => { ids.forEach((id) => l.delete(id)); }),
  };
}

// Fase 2 (com login): os dados vão para o servidor (/api/v2/dados), com as mesmas operações.
// "chamar" faz o pedido HTTP; nos testes, é trocado por uma função que simula a rota.
export function adaptadorServidor(chamar = chamarRota) {
  const pedir = (pedido) => chamar(pedido);
  return {
    obter: (t, id) => pedir({ op: "obter", tabela: t, id }).then((r) => r ?? undefined),
    todos: (t) => pedir({ op: "todos", tabela: t }),
    porIndice: (t, indice, valor) => pedir({ op: "porIndice", tabela: t, indice, valor }),
    salvar: (t, registros) => (registros.length ? pedir({ op: "salvar", tabela: t, registros }) : Promise.resolve()),
    remover: (t, ids) => (ids.length ? pedir({ op: "remover", tabela: t, ids }) : Promise.resolve()),
  };
}
async function chamarRota(pedido) {
  const resp = await fetch("/api/v2/dados", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pedido) });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(dados.erro || "Falha ao acessar os baralhos salvos.");
  return dados.resultado;
}

// Junta adaptadores por tabela: baralhos no servidor, catálogo de pontes em memória (é fixo, vem do código)
// e áudios no navegador (arquivos grandes; ficam neste aparelho por enquanto).
export function adaptadorMisto({ servidor, local, memoria }) {
  const qual = (t) => (t === "arquivos" ? local : t === "bridge_templates" ? memoria : servidor);
  return {
    obter: (t, id) => qual(t).obter(t, id),
    todos: (t) => qual(t).todos(t),
    porIndice: (t, i, v) => qual(t).porIndice(t, i, v),
    salvar: (t, r) => qual(t).salvar(t, r),
    remover: (t, ids) => qual(t).remover(t, ids),
  };
}
