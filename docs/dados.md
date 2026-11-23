# Dados

Dono: Pedro. A aba Dados rola os dados clássicos de RPG, do d2 ao d20, com um botão para cada. Na campanha, quem sorteia é o servidor, e todos que participam veem cada rolagem na hora. O mestre também rola em segredo.

## Como usar

- **Rolar:** toque no botão do dado. Ele gira por meio segundo em cima do feltro e para no resultado. A legenda embaixo diz o que saiu, e o leitor de tela anuncia.
- **Máximo e mínimo:** o número fica framboesa quando sai a face mais alta e apagado quando sai o 1. No d2 não há marca, porque as duas faces seriam extremos.
- **Últimas rolagens:** as 30 mais novas da campanha, de todos, com quem rolou, o dado, o resultado e a hora. As da própria pessoa aparecem como "Você".
- **Rolar em segredo:** só aparece para o mestre. Ligado, os botões ficam tracejados, o feltro ganha o selo "Em segredo", e só os mestres da campanha veem essas rolagens. Os jogadores não ficam sabendo nem que houve uma.
- **Sem campanha:** sem entrar no servidor, ou sem campanha aberta, a aba rola só no aparelho, com o gerador aleatório do navegador. O histórico some ao fechar a página.
- **Movimento reduzido:** quem pediu menos movimento no aparelho vê o resultado direto, sem o giro.

## Como funciona

- `tipos.ts`: a `Rolagem` e os `LADOS` (2, 4, 6, 8, 10, 12 e 20).
- `repositorio.ts`: o contrato `RepositorioDados` (ver `docs/contratos.md`, "Dados e servidor"). Duas implementações: a local (`local.ts`) e a do servidor (`app/src/servidor/repositorio-dados.ts`, área do servidor).
- `operacoes.ts`: funções puras. O sorteio local descarta os bytes do fim da faixa para cada face ter a mesma chance, o histórico junta rolagens sem repetir, e os textos (hora, nome, frase para o leitor de tela).
- `mesa.ts`: o estado da aba, fora do React. Guarda o histórico, a última rolagem e o dado que está girando. Enquanto o dado gira, o que chega fica guardado, para o histórico não mostrar o resultado antes da hora. Cria o repositório ao abrir e o fecha ao fechar, e pode abrir de novo, como o React faz em desenvolvimento.
- `TelaDados.tsx`: a tela. Monta uma mesa nova a cada troca de servidor, conta, campanha ou papel.
- `icones.tsx`: o desenho de cada dado, à mão. Nos botões é só o traço. No feltro, o dado é de marfim, com as arestas apagadas, para o número ficar legível.

No servidor, o sorteio, as regras e a limpeza estão em `docs/servidor/README.md`, seção "Dados".

## Próximos passos

- **Dados 3D caindo sobre o mapa.** A ideia é usar o Three.js (biblioteca 3D, MIT, uns 135 KB compactados, carregados só na primeira rolagem) com uma animação roteirizada: o dado gira, quica e para na face que o servidor sorteou. Assim todos veem a mesma cena e o resultado continua vindo do servidor. Depende de o GrifoCaolho aprovar o visual por cima do mapa e de o Pedro aprovar a dependência nova.
- **Rolagens da ficha** (`roll@forca`, no roteiro das fichas): quando a ficha descongelar, ela pode usar o mesmo `RepositorioDados`.
