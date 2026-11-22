# Contratos entre áreas

O que uma área oferece para as outras. Mudar qualquer item daqui afeta mais de uma pessoa: o Claude analisa os riscos, avisa antes, atualiza este arquivo no mesmo pull request e explica a mudança na descrição.

## Telas (núcleo e todas as áreas)

Arquivo: `app/src/nucleo/telas.ts`

Cada área cria `app/src/<area>/tela.ts` exportando:

```ts
export const tela: DefinicaoTela = {
  id: 'mapa',          // estável, sem acento. Fica salvo como última tela aberta
  nome: 'Mapa',        // texto da aba
  ordem: 20,           // posição da aba: 10, 20, 30...
  Componente: MapaHex, // ocupa todo o espaço abaixo das abas
}
```

O `tela.ts` importa o CSS da própria área. Ordens em uso: fichas 10, mapa 20.

## Tema (núcleo e todas as áreas)

Arquivos: `app/src/nucleo/tema.css` e `app/src/nucleo/aparencia.ts`

- Variáveis da interface: `--ui-papel`, `--ui-papel-2`, `--ui-papel-3`, `--ui-campo`, `--ui-linha`, `--ui-tinta`, `--ui-tinta-2`, `--feltro`, `--feltro-escuro`, `--acento`, `--acento-forte`, `--acento-suave`, `--perigo`, `--perigo-suave`, `--ui-fonte` e `--ui-mono`. Todas mudam sozinhas no tema escuro.
- Botões comuns: `.botao-icone` (com `--perigo`), `.botao-topo` (com `--principal`), `.grupo-botoes` e `.espaco`.
- `useAparencia()` devolve `{ tema, escuro, folhaClara, mudar }` e é o mesmo estado em todas as telas. O botão de tema fica na barra de abas.

Remover ou renomear uma variável ou classe daqui quebra as outras áreas.

## Mapa e servidor

Arquivos: `app/src/mapa/repositorio.ts` e `app/src/mapa/tipos.ts` (área do mapa). Detalhes em `docs/mapa/manual.md`, seção "Ligar o servidor".

```ts
interface RepositorioMapa {
  carregarChunk(chaveDoChunk: string): Promise<Hexagono[]>
  aplicar(lote: Lote): Promise<void>
  assinar(ouvinte: (lote: Lote) => void): () => void
}
```

- O servidor implementa `RepositorioPocketBase` em `app/src/servidor/`.
- `aplicar` é atômico por lote. `assinar` entrega lotes de outros clientes, e o próprio eco é ignorado pelo `id` do lote.
- A ordem em que os lotes chegam do servidor é a verdade.
- Um chunk que falhou ao carregar não pode ser gravado como vazio por cima do verdadeiro.
- A camada privada do mestre fica em coleções separadas, protegidas no servidor.

## Configuração

- `VITE_POCKETBASE_URL`: endereço do PocketBase usado pelo app (modelo em `app/.env.example`).
