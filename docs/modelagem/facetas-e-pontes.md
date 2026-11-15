# Modelagem de Dados: Facetas e Pontes

*Especificação de arquitetura e banco de dados · Autor: CauanGS*

> Versão em texto do documento [`Modelagem_de_Dados_-_Facetas_e_Pontes.pdf`](Modelagem_de_Dados_-_Facetas_e_Pontes.pdf). O PDF é a versão original.

**Princípio fundamental:** o grande segredo para não engessar o sistema quando você quiser adicionar as linhas tracejadas do diagrama (como *Imagem → Palavra* ou *Frase + Imagem → Palavra*) é separar o **dado bruto** da **forma como ele é apresentado**.

## 1. Conceito / Item lexical (`concepts`)

Representa o núcleo semântico da unidade de aprendizado (por exemplo, o conceito "água" em japonês), servindo como ponto central de agrupamento para todas as suas representações e variações.

## 2. Facetas (`facets`)

Em vez de colunas fixas (`palavra`, `audio_url`, `frase`, `imagem_url`) na mesma tabela, utiliza-se uma tabela polimórfica ou tipada ligada diretamente ao `concept_id`.

| Elemento | Estrutura / Valores | Diretriz de implementação |
|---|---|---|
| `facet_type` | `WORD`, `MEANING`, `AUDIO`, `SENTENCE`, `IMAGE` | Classifica o tipo de dado bruto vinculado ao conceito. |
| Metadados (`JSONB`) | `furigana`, `romaji`, `audio_slow_url`, `cloze_indices` | Armazena atributos específicos de cada tipo de faceta sem rigidez estrutural. |

**Vantagem arquitetural:** adicionar suporte a `IMAGE` no futuro não exige alterar o schema principal — basta inserir novas facetas e novas regras de conexão.

## 3. Definição das Pontes / Templates (`bridge_templates`)

Define as setas direcionadas do grafo de aprendizado, especificando como as facetas são combinadas na frente e no verso de cada carta. Todas as pontes ativas são disponibilizadas simultaneamente ("tudo sempre ao todo"), sem cadeia de pré-requisitos entre si.

| Campo | Exemplos / Tipo | Papel no grafo |
|---|---|---|
| `id` / `code` | `WORD_TO_MEANING`, `CLOZE_SENTENCE_TO_WORD` | Identificador único e código semântico da regra de conexão. |
| `front_facet_types` | Array: `['SENTENCE', 'IMAGE']` (ponte 6) | Define quais tipos de faceta compõem o estímulo frontal da carta. |
| `back_facet_types` | Array: `['WORD']` | Define quais tipos de faceta compõem a resposta no verso da carta. |

## 4. Cartas do Usuário (`user_cards`)

Representa a instância materializada da seta (ponte) aplicada a um conceito para um usuário específico, mantendo o estado individual de memória e agendamento independente.

- **Campos de SRS (FSRS ou SM-2):** `stability`, `difficulty` e `due_at` para cálculo de retenção e agendamento de revisões.
- **Ciclo de vida (`state`):** `NEW`, `LEARNING`, `REVIEW` (todas as cartas já nascem disponíveis como `NEW`).
