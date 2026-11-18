// Banco de palavras no Postgres (Neon, conectado pela Vercel → Storage).
// Só é usado no servidor e só quando DATABASE_URL existe; sem ela, o app funciona sem o banco.
// A tabela é criada na primeira vez que o servidor precisa dela.
//
// Cada linha é uma palavra gerada pelo Módulo 2, campo a campo, para dar para consultar com SQL:
//   select lemma, significado, usos from palavras_geradas order by usos desc limit 20;

export const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS palavras_geradas (
    id              bigserial PRIMARY KEY,
    chave           text UNIQUE NOT NULL,      -- idioma + nível + palavra em português + sentido + versão do prompt
    idioma          text NOT NULL,             -- zh
    nivel           text NOT NULL,             -- HSK 1 ... HSK 6
    entrada         text NOT NULL,             -- o que a pessoa digitou (ex.: água)
    sentido         text,                      -- dica de sentido (ex.: dinheiro, para "banco")
    versao_prompt   integer NOT NULL,
    lemma           text NOT NULL,             -- a palavra no idioma-alvo
    leitura         text,                      -- pinyin, hiragana ou IPA, conforme o idioma
    genero          text,                      -- m/f (francês e espanhol)
    classe          text,                      -- substantivo, verbo...
    significado     text,
    frase           text,
    frase_leitura   text,
    frase_traducao  text,
    trecho_na_frase text,                      -- de onde o código calcula a lacuna
    ambigua         boolean,
    outros_sentidos text,
    nivel_adequado  boolean,
    nota            text,
    hsk             smallint,                  -- nível na lista oficial do HSK (7 = acima do HSK 6)
    usos            integer NOT NULL DEFAULT 0, -- quantas vezes foi reaproveitada
    criado_em       timestamptz NOT NULL DEFAULT now(),
    atualizado_em   timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS palavras_geradas_lemma ON palavras_geradas (idioma, lemma)`,
  // Migração (18/11): as colunas nasceram como pinyin/frase_pinyin, quando só havia mandarim.
  // Em bancos antigos, renomeia sem perder dados; em bancos novos, não faz nada.
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'palavras_geradas' AND column_name = 'pinyin') THEN
       ALTER TABLE palavras_geradas RENAME COLUMN pinyin TO leitura;
     END IF;
     IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'palavras_geradas' AND column_name = 'frase_pinyin') THEN
       ALTER TABLE palavras_geradas RENAME COLUMN frase_pinyin TO frase_leitura;
     END IF;
   END $$`,
  `ALTER TABLE palavras_geradas ADD COLUMN IF NOT EXISTS genero text`,
];

// Linha do banco → formato que o Módulo 2 devolve (o mesmo da resposta da IA)
export const paraResposta = (l) => ({
  lemma: l.lemma, leitura: l.leitura, genero: l.genero ?? "", pos: l.classe, meaning: l.significado,
  sentence: l.frase, frase_leitura: l.frase_leitura, sentence_translation: l.frase_traducao, target_in_sentence: l.trecho_na_frase,
  ambiguous: l.ambigua, other_senses: l.outros_sentidos, level_fit: l.nivel_adequado, note: l.nota,
});

let pronto = null;

// sqlTeste: nos testes, um banco simulado no lugar do Neon
export async function bancoPalavrasPostgres(url = process.env.DATABASE_URL, { sqlTeste = null } = {}) {
  if (!url && !sqlTeste) return null;
  const sql = sqlTeste ?? (await import("@neondatabase/serverless")).neon(url);
  if (sqlTeste) pronto = null;
  if (!pronto) {
    pronto = (async () => { for (const comando of ESQUEMA) await sql.query(comando); })()
      .catch((e) => { pronto = null; throw e; });
  }
  await pronto;

  return {
    async buscar(chaves) {
      if (!chaves.length) return new Map();
      const linhas = await sql`UPDATE palavras_geradas SET usos = usos + 1 WHERE chave = ANY(${chaves}) RETURNING *`;
      return new Map(linhas.map((l) => [l.chave, paraResposta(l)]));
    },
    async guardar(itens, { substituir = false } = {}) {
      for (const { chave, resposta: r, partes: p } of itens) {
        const valores = [chave, p.idioma, p.nivel, p.entrada, p.sentido, p.versao, r.lemma, r.leitura ?? r.pinyin ?? null, r.pos, r.meaning,
          r.sentence, r.frase_leitura ?? r.sentence_pinyin ?? null, r.sentence_translation, r.target_in_sentence, r.ambiguous, r.other_senses || null, r.level_fit, r.note || null, p.hsk, r.genero || null];
        const conflito = substituir
          ? `ON CONFLICT (chave) DO UPDATE SET lemma = EXCLUDED.lemma, leitura = EXCLUDED.leitura, genero = EXCLUDED.genero, classe = EXCLUDED.classe,
               significado = EXCLUDED.significado, frase = EXCLUDED.frase, frase_leitura = EXCLUDED.frase_leitura,
               frase_traducao = EXCLUDED.frase_traducao, trecho_na_frase = EXCLUDED.trecho_na_frase, ambigua = EXCLUDED.ambigua,
               outros_sentidos = EXCLUDED.outros_sentidos, nivel_adequado = EXCLUDED.nivel_adequado, nota = EXCLUDED.nota,
               hsk = EXCLUDED.hsk, atualizado_em = now()`
          : "ON CONFLICT (chave) DO NOTHING";
        await sql.query(
          `INSERT INTO palavras_geradas (chave, idioma, nivel, entrada, sentido, versao_prompt, lemma, leitura, classe, significado,
             frase, frase_leitura, frase_traducao, trecho_na_frase, ambigua, outros_sentidos, nivel_adequado, nota, hsk, genero)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) ${conflito}`,
          valores
        );
      }
    },
  };
}
