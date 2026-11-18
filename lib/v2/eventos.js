"use client";
// Eventos de produto: fila durável no navegador (IndexedDB) e envio em lotes.
// O servidor decide de quem é o evento pela sessão; aqui só guardamos o aparelho
// e o que aconteceu, para não perder nada se a aba fechar no meio da sessão.
const BANCO = "karta-eventos";
const LOJA = "fila";
const LOTE = 200;
const INTERVALO = 30000;
const ESPERA = 4000;
const CHAVE_DISPOSITIVO = "karta:eventos:dispositivo";

function habilitado() {
  if (typeof window === "undefined") return false;
  const flag = process.env.NEXT_PUBLIC_EVENTOS;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return process.env.NODE_ENV === "production";
}

let abrindo = null;
function abrir() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  abrindo ??= new Promise((ok, falha) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: "event_id" });
    };
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => falha(pedido.error);
  });
  return abrindo;
}

async function comLoja(modo, operacao) {
  const db = await abrir();
  if (!db) return null;
  return new Promise((ok, falha) => {
    const t = db.transaction(LOJA, modo);
    const loja = t.objectStore(LOJA);
    const pedido = operacao(loja);
    t.oncomplete = () => ok(pedido?.result ?? null);
    t.onerror = () => falha(t.error);
    t.onabort = () => falha(t.error);
  });
}

function dispositivo() {
  try {
    let d = localStorage.getItem(CHAVE_DISPOSITIVO);
    if (!d) {
      d = crypto.randomUUID();
      localStorage.setItem(CHAVE_DISPOSITIVO, d);
    }
    return d;
  } catch {
    return null;
  }
}

export function registrarEvento(tipo, dados = {}) {
  if (!habilitado()) return;
  iniciarEventos();
  const evento = {
    event_id: crypto.randomUUID(),
    tipo,
    ocorrido_em: new Date().toISOString(),
    deck_id: dados.deck_id ?? null,
    card_id: dados.card_id ?? null,
    concept_id: dados.concept_id ?? null,
    rating: dados.rating ?? null,
    duracao_ms: Number.isFinite(dados.duracao_ms) ? Math.round(dados.duracao_ms) : null,
    idioma: dados.idioma ?? null,
    app_versao: process.env.NEXT_PUBLIC_VERSAO ?? null,
    payload: dados.payload ?? null,
  };
  comLoja("readwrite", (l) => l.put(evento)).catch(() => {});
  agendar();
}

let timer = null;
function agendar() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    descarregar();
  }, ESPERA);
}

let enviando = false;
export async function descarregar() {
  if (!habilitado()) return;
  if (enviando || typeof window === "undefined") return;
  enviando = true;
  try {
    const fila = await comLoja("readonly", (l) => l.getAll());
    if (!fila?.length) return;
    const d = dispositivo();
    if (!d) return;
    const lote = fila.slice(0, LOTE);
    const resp = await fetch("/api/v2/eventos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dispositivo: d, eventos: lote }),
    });
    if (!resp.ok) return;
    await comLoja("readwrite", (l) => {
      for (const e of lote) l.delete(e.event_id);
    });
    if (fila.length > LOTE) agendar();
  } catch {
    // sem rede: fica na fila para a próxima tentativa
  } finally {
    enviando = false;
  }
}

function enviarAoSair() {
  const d = dispositivo();
  comLoja("readonly", (l) => l.getAll())
    .then((fila) => {
      if (!fila?.length || !d || !navigator.sendBeacon) return;
      const corpo = JSON.stringify({ dispositivo: d, eventos: fila.slice(0, LOTE) });
      navigator.sendBeacon("/api/v2/eventos", new Blob([corpo], { type: "application/json" }));
    })
    .catch(() => {});
}

let ligado = false;
export function iniciarEventos() {
  if (ligado || !habilitado()) return;
  ligado = true;
  setInterval(() => {
    if (document.visibilityState === "visible") descarregar();
  }, INTERVALO);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") enviarAoSair();
    else descarregar();
  });
  window.addEventListener("pagehide", enviarAoSair);
  descarregar();
}
