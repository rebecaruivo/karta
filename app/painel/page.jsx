import { notFound } from "next/navigation";
import { usuarioAtual } from "@/lib/auth/server";
import { ehAdmin } from "@/lib/auth/admin";
import { coletarMetricas } from "@/lib/v2/metricas";

export const dynamic = "force-dynamic";


const TINTA = "#1D1B2E";
const AZUL = "#3B6FE0";
const LINHA = "#E4E4EA";
const SUAVE = "#4A4760";

const fmt = (n) => (n === null || n === undefined ? "—" : n.toLocaleString("pt-BR"));
const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);
const dur = (s) => (s === null || s === undefined ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

function Cartao({ titulo, valor, nota }) {
  return (
    <div style={{ background: "#F3F7FF", borderRadius: 18, padding: "18px 20px", minWidth: 160, flex: 1 }}>
      <div style={{ fontSize: 13, color: SUAVE, marginBottom: 8 }}>{titulo}</div>
      <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "Outfit, sans-serif", lineHeight: 1 }}>{valor}</div>
      {nota ? <div style={{ fontSize: 12, color: SUAVE, marginTop: 8 }}>{nota}</div> : null}
    </div>
  );
}

function Secao({ titulo, subtitulo, children }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontFamily: "Outfit, sans-serif", fontSize: 20, margin: "0 0 4px" }}>{titulo}</h2>
      {subtitulo ? <p className="mu" style={{ margin: "0 0 14px" }}>{subtitulo}</p> : null}
      {children}
    </section>
  );
}

function Grafico({ serie }) {
  const maximo = Math.max(1, ...serie.map((d) => d.logado + d.anonimo));
  const altura = 140;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: altura + 28, borderBottom: `1px solid ${LINHA}` }}>
        {serie.map((d) => {
          const hLogado = Math.round((d.logado / maximo) * altura);
          const hAnonimo = Math.round((d.anonimo / maximo) * altura);
          return (
            <div key={d.dia} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: altura }}
              title={`${d.dia} · ${d.logado} logados, ${d.anonimo} anônimos`}>
              <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2 }}>
                <div style={{ height: hLogado, background: TINTA, borderRadius: "4px 4px 0 0" }} />
                <div style={{ height: hAnonimo, background: AZUL, borderRadius: hLogado ? 0 : "4px 4px 0 0" }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        {serie.map((d, i) => (
          <div key={d.dia} style={{ flex: 1, textAlign: "center", fontSize: 11, color: SUAVE }}>
            {i % 2 === 0 ? d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7) : ""}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 13, color: SUAVE }}>
        <span><i style={{ display: "inline-block", width: 12, height: 12, background: TINTA, borderRadius: 3, marginRight: 6 }} />Logados</span>
        <span><i style={{ display: "inline-block", width: 12, height: 12, background: AZUL, borderRadius: 3, marginRight: 6 }} />Anônimos</span>
      </div>
    </div>
  );
}

function Funil({ etapas }) {
  const maior = Math.max(1, ...etapas.map((e) => e.valor ?? 0));
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {etapas.map((e) => (
        <div key={e.rotulo}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span>{e.rotulo}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(e.valor)}</span>
          </div>
          <div style={{ height: 8, background: "#EEF3FC", borderRadius: 4 }}>
            <div style={{ height: 8, width: `${Math.round(((e.valor ?? 0) / maior) * 100)}%`, background: e.cor ?? TINTA, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function Painel() {
  const usuario = await usuarioAtual();
  if (!ehAdmin(usuario)) notFound();

  if (!process.env.DATABASE_URL) return <p>Banco não configurado (DATABASE_URL ausente).</p>;

  let m;
  try {
    const { neon } = await import("@neondatabase/serverless");
    m = await coletarMetricas(neon(process.env.DATABASE_URL));
  } catch (e) {
    return <p>Não consegui carregar as métricas agora. {e?.message}</p>;
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1>Painel</h1>
      <p className="mu" style={{ margin: "0 0 28px", maxWidth: 640 }}>
        Métricas de produto. Eventos coletados a partir de agora; baralhos e revisões anteriores entram no retrato
        abaixo. Dias no fuso de São Paulo; uma sessão é separada por 30 minutos de inatividade.
      </p>

      <Secao titulo="Logados" subtitulo="Contas no Neon Auth e atividade registrada com user_id.">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Cartao titulo="Cadastros" valor={fmt(m.contas)} nota={`${fmt(m.novas)} nos últimos 7 dias`} />
          <Cartao titulo="Com baralho" valor={fmt(m.ativacao.logado)} nota="ativação" />
          <Cartao titulo="Estudaram (7d)" valor={fmt(m.wau.logado)} nota="cartas respondidas ou revisão recente" />
          <Cartao titulo="Respostas “Fácil”" valor={pct(m.taxas.pctDecoreiLogado)} nota={`${pct(m.taxas.pctNaoLogado)} “Difícil” · 30 dias`} />
        </div>
      </Secao>

      <Secao titulo="Anônimos" subtitulo="Uso sem conta, identificado por aparelho. Não é fundido com a conta ao entrar.">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Cartao titulo="Com baralho" valor={fmt(m.ativacao.anonimo)} nota="criou ao menos um baralho" />
          <Cartao titulo="Estudaram (7d)" valor={fmt(m.wau.anonimo)} nota="cartas respondidas" />
          <Cartao titulo="Respostas “Fácil”" valor={pct(m.taxas.pctDecoreiAnonimo)} nota={`${pct(m.taxas.pctNaoAnonimo)} “Difícil” · 30 dias`} />
        </div>
      </Secao>

      <Secao titulo="Cartas respondidas por dia" subtitulo="Últimos 14 dias, somando logados e anônimos.">
        <Grafico serie={m.serie} />
      </Secao>

      <Secao titulo="Tempo de construção" subtitulo="Do início da geração das facetas até o baralho pronto. Mediana e p90; iniciado sem concluir conta como abandono.">
        <div style={{ display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div>
            <h3 style={{ fontSize: 15, margin: "0 0 12px" }}>Logados</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Cartao titulo="Mediana" valor={dur(m.criacao.logado.mediana)} nota={`p90 ${dur(m.criacao.logado.p90)}`} />
              <Cartao titulo="Concluídos" valor={fmt(m.criacao.logado.concluidos)} nota={`de ${fmt(m.criacao.logado.iniciados)} iniciados`} />
              <Cartao titulo="Abandonos" valor={fmt(m.criacao.logado.abandonados)} nota="iniciou e não terminou" />
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: 15, margin: "0 0 12px" }}>Anônimos</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Cartao titulo="Mediana" valor={dur(m.criacao.anonimo.mediana)} nota={`p90 ${dur(m.criacao.anonimo.p90)}`} />
              <Cartao titulo="Concluídos" valor={fmt(m.criacao.anonimo.concluidos)} nota={`de ${fmt(m.criacao.anonimo.iniciados)} iniciados`} />
              <Cartao titulo="Abandonos" valor={fmt(m.criacao.anonimo.abandonados)} nota="iniciou e não terminou" />
            </div>
          </div>
        </div>
      </Secao>

      <Secao titulo="Funil">
        <div style={{ display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div>
            <h3 style={{ fontSize: 15, margin: "0 0 12px" }}>Logados</h3>
            <Funil etapas={[
              { rotulo: "Cadastro", valor: m.funil.logado.contas },
              { rotulo: "Criou 1º baralho", valor: m.funil.logado.baralho },
              { rotulo: "Iniciou 1ª sessão", valor: m.funil.logado.estudo },
            ]} />
          </div>
          <div>
            <h3 style={{ fontSize: 15, margin: "0 0 12px" }}>Anônimos</h3>
            <Funil etapas={[
              { rotulo: "Criou 1º baralho", valor: m.funil.anonimo.baralho, cor: AZUL },
              { rotulo: "Iniciou 1ª sessão", valor: m.funil.anonimo.estudo, cor: AZUL },
            ]} />
          </div>
        </div>
      </Secao>
    </div>
  );
}
