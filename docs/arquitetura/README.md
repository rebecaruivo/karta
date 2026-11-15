# Arquitetura modular de geração de baralhos (v2, em design)

Documento: [`Karta_-_Arquitetura_modular_de_geracao_de_baralhos.pdf`](Karta_-_Arquitetura_modular_de_geracao_de_baralhos.pdf) · versão 0.2 · status: design, antes da implementação.

Protótipo visual das cartas: [`cartas-por-conexao.html`](cartas-por-conexao.html).

## Autoria

| Parte | Autoria |
|---|---|
| Documento de arquitetura: pipeline em 3 módulos, pontos de entrada, perfis por idioma, fluxo de criação e gestão do baralho, regras e limites | Rebeca e Gabriel Pinto |
| Protótipo visual *Cartas por conexão* | Rebeca |
| **Modelo de dados** (seção 7): conceitos, facetas, pontes e cartas do usuário | Baseado na [modelagem de dados de CauanGS](../modelagem/) |

No documento, a coluna **"Origem"** das tabelas da seção 7 distingue as duas coisas:
- **"Modelo"** é o que vem da modelagem de dados de CauanGS;
- **"Proposta"** é o que o documento de arquitetura acrescenta.

## Em uma frase

A unidade central deixa de ser a carta e passa a ser a palavra com suas **facetas** (escrita, significado, áudio, frase). As cartas são derivadas das facetas por **pontes** (regras "da faceta X para a faceta Y"), até 7 por palavra.
