// Onde os áudios ficam: IndexedDB, um banco de dados que todo navegador tem.
// Por que não localStorage? localStorage só guarda texto e aguenta ~5 MB no total.
// Um baralho de 10 cartas com áudio já ocupa ~1,7 MB. IndexedDB guarda arquivos
// (Blobs) e aguenta centenas de MB.
// Chave de cada áudio: "<id da carta>:palavra" ou "<id da carta>:exemplo".

const BANCO = "karta";
const TABELA = "audios";

function abrir() {
  return new Promise((ok, falha) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(TABELA);
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => falha(pedido.error);
  });
}

async function transacao(modo, operacao) {
  const banco = await abrir();
  return new Promise((ok, falha) => {
    const t = banco.transaction(TABELA, modo);
    const resultado = operacao(t.objectStore(TABELA));
    t.oncomplete = () => ok(resultado?.result);
    t.onerror = () => falha(t.error);
  });
}

export const chaveAudio = (cartaId, campo) => `${cartaId}:${campo}`;
export const salvarAudio = (chave, blob) => transacao("readwrite", (s) => s.put(blob, chave));
export const obterAudio = (chave) => transacao("readonly", (s) => s.get(chave));
export const apagarAudios = (chaves) =>
  transacao("readwrite", (s) => { chaves.forEach((k) => s.delete(k)); });
