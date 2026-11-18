// Parte visual do painel de admin (sem consultas): recebe o painel já montado por montarPainel.
// Separada da página para dar para renderizar com dados de exemplo.
import { fmt, pct } from "@/lib/v2/painel";

// Mesma escala de azul da aba Progresso (validada para daltonismo): escuro = com conta, claro = sem conta
const COM_CONTA = "#2246BE";
const SEM_CONTA = "#93ADF1";
const fmtDia = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const hora = (iso) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function Numero({ titulo, valor, nota }) {
  return (
    <div className="pg-num">
      <div className="mu pg-num-t">{titulo}</div>
      <div className="pg-num-v">{valor}</div>
      {nota && <div className="mu pg-num-n">{nota}</div>}
    </div>
  );
}

function Secao({ titulo, sub, children }) {
  return (
    <section className="pn-sec">
      <h2>{titulo}</h2>
      {sub ? <p className="mu pn-sub">{sub}</p> : <div style={{ height: 12 }} />}
      {children}
    </section>
  );
}

// Barras empilhadas por dia. A dica aparece com o mouse ou com o teclado (Tab), só com CSS.
function PorDia({ serie }) {
  const max = Math.max(1, ...serie.map((d) => d.logado + d.anonimo));
  const ultimo = serie.length - 1;
  const texto = (d) => `${fmtDia(d.dia)}: ${d.logado + d.anonimo} carta(s) · ${d.logado} com conta, ${d.anonimo} sem conta`;
  return (
    <figure className="pg-fig" aria-label="Cartas respondidas por dia, últimos 14 dias">
      <div className="pg-legenda">
        <span><i style={{ background: COM_CONTA }} />Com conta</span>
        <span><i style={{ background: SEM_CONTA }} />Sem conta</span>
      </div>
      <div className="pn-barras">
        {serie.map((d) => (
          <div key={d.dia} className="pn-col" tabIndex={0} aria-label={texto(d)}>
            <div className="pn-dica" role="tooltip">{texto(d)}</div>
            {d.anonimo > 0 && <div className="pn-seg" style={{ height: `${(d.anonimo / max) * 100}%`, background: SEM_CONTA, order: 1 }} />}
            {d.logado > 0 && <div className="pn-seg" style={{ height: `${(d.logado / max) * 100}%`, background: COM_CONTA, order: 2, borderRadius: d.anonimo ? 0 : "4px 4px 0 0" }} />}
          </div>
        ))}
      </div>
      <div className="pg-eixo" aria-hidden="true">
        {serie.map((d, i) => <span key={d.dia}>{(ultimo - i) % 2 === 0 ? fmtDia(d.dia) : ""}</span>)}
      </div>
      <details className="pg-tabela"><summary className="mu">Ver os números</summary>
        <table><thead><tr><th>Dia</th><th>Com conta</th><th>Sem conta</th></tr></thead>
          <tbody>{serie.map((d) => <tr key={d.dia}><td>{fmtDia(d.dia)}</td><td>{d.logado}</td><td>{d.anonimo}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

function Horizontais({ itens }) {
  return (
    <div className="pn-hs">
      {itens.map((e) => (
        <div key={e.rotulo}>
          <div className="pn-h-cab"><span>{e.rotulo}</span><span>{e.valor}</span></div>
          <div className="pn-h-trilho"><div className="pn-h-barra" style={{ width: `${e.largura}%` }} /></div>
          {e.conversao !== undefined && e.conversao !== null && <p className="mu pn-conv">{e.conversao}% da etapa anterior</p>}
        </div>
      ))}
    </div>
  );
}

const etapas = (lista) => lista.map((e) => ({ ...e, valor: fmt(e.valor) }));

export default function PainelVisao({ p, geradoEm }) {
  return (
    <div className="v2 pn">
      <div className="pn-cab">
        <h1>Painel</h1>
        <span className="mu pn-hora">Atualizado às {hora(geradoEm)} · recarregue para atualizar</span>
      </div>
      <p className="mu" style={{ margin: "0 0 28px", maxWidth: 640 }}>Como o Karta está sendo usado, com e sem conta. Só administradoras veem esta página.</p>

      {p.vazio && <div className="aviso" style={{ marginBottom: 28 }}>Ainda não há eventos registrados. Os números aparecem conforme as pessoas criam baralhos e estudam (em produção, ou com NEXT_PUBLIC_EVENTOS=1 no ambiente local).</div>}

      <div className="pg-nums">{p.destaques.map((d) => <Numero key={d.titulo} {...d} />)}</div>

      <Secao titulo="Cartas respondidas por dia" sub="Últimos 14 dias.">
        <PorDia serie={p.serie} />
      </Secao>

      <Secao titulo="Com conta e sem conta" sub="Quem usa sem conta é contado por aparelho; ao entrar, o histórico anterior não é somado à conta.">
        <table className="pn-tab">
          <thead><tr><th scope="col">Métrica</th><th scope="col">Com conta</th><th scope="col">Sem conta</th></tr></thead>
          <tbody>
            {p.comparacao.map(([rotulo, a, b, nota]) => (
              <tr key={rotulo}>
                <td>{rotulo}{nota && <small>{nota}</small>}</td>
                <td className="pn-v">{a}</td>
                <td className="pn-v">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Secao>

      <Secao titulo="Funil" sub="Quantas pessoas chegam a cada etapa, e quanto passa de uma etapa para a próxima.">
        <div className="pn-duas">
          <div><h3>Com conta</h3><Horizontais itens={etapas(p.funis.logado)} /></div>
          <div><h3>Sem conta</h3><Horizontais itens={etapas(p.funis.anonimo)} /></div>
        </div>
      </Secao>

      <Secao titulo="Banco de palavras" sub="Palavras já geradas ficam guardadas e são reaproveitadas por qualquer pessoa, sem gastar a chave do Gemini de novo.">
        {!p.banco ? <p className="mu">O banco de palavras ainda não foi criado neste ambiente.</p> : (
          <>
            <div className="pg-nums" style={{ marginBottom: 20 }}>
              <Numero titulo="Palavras guardadas" valor={p.banco.palavras} />
              <Numero titulo="Reaproveitamentos" valor={p.banco.usos} nota="palavras entregues sem chamar a IA" />
              <Numero titulo="Vieram do banco (30 dias)" valor={pct(p.banco.acerto)}
                nota={p.banco.palavras30d ? `das ${fmt(p.banco.palavras30d)} palavras dos baralhos criados` : "medido a partir de 18/11"} />
            </div>
            {p.banco.porIdioma.length > 0 && (
              <table className="pn-tab">
                <thead><tr><th scope="col">Idioma</th><th scope="col">Palavras</th><th scope="col">Reaproveitamentos</th></tr></thead>
                <tbody>{p.banco.porIdioma.map((l) => <tr key={l.nome}><td>{l.nome}</td><td className="pn-v">{l.palavras}</td><td className="pn-v">{l.usos}</td></tr>)}</tbody>
              </table>
            )}
          </>
        )}
      </Secao>

      <Secao titulo="Baralhos por idioma" sub="Criados nos últimos 30 dias.">
        {p.idiomas.length === 0 ? <p className="mu">Nenhum baralho criado nos últimos 30 dias.</p>
          : <Horizontais itens={p.idiomas.map((l) => ({ rotulo: l.nome, valor: fmt(l.n), largura: l.largura }))} />}
      </Secao>

      <details className="pn-notas mu">
        <summary>Como os números são calculados</summary>
        <ul>
          <li>Dias no fuso de São Paulo. Os eventos começaram a ser coletados com o painel; baralhos e revisões anteriores entram em “criaram baralho” e “estudaram”.</li>
          <li>“Estudou” = respondeu ao menos uma carta (ou iniciou uma sessão).</li>
          <li>Tempo para criar: do início da geração das facetas até o baralho pronto. Mediana e p90 (90% levaram menos que isso). Iniciado e não concluído conta como abandono.</li>
          <li>“Fácil” e “Difícil” são os botões do estudo; “Médio” é o restante.</li>
        </ul>
      </details>
    </div>
  );
}
