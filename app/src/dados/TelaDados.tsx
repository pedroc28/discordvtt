// Aba Dados: um botão para cada dado, a última rolagem em cima do feltro e o histórico da campanha.
// Só lê o estado da MesaDados e chama rolar: quem sorteia é o repositório (o servidor, na campanha,
// ou este aparelho, sem campanha).

import { useEffect, useState, useSyncExternalStore } from 'react'
import { abrirRepositorioDados, useServidor } from '../servidor/conexao'
import type { EstadoServidor } from '../servidor/tipos'
import { FormaDado, IconeSegredo } from './icones'
import { RepositorioDadosLocal } from './local'
import { MesaDados, type EstadoMesa } from './mesa'
import { descreverRolagem, extremo, formatarHora, nomeDeQuemRolou } from './operacoes'
import { LADOS, type Lados, type Rolagem } from './tipos'

// Quanto o dado gira antes de mostrar o resultado, se a pessoa não pediu menos movimento.
const GIRO_MINIMO = 550

function prefereMenosMovimento(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Campanha aberta no servidor e papel da pessoa nela, ou null para rolar só neste aparelho. */
function campanhaAberta(servidor: EstadoServidor) {
  const campanha = servidor.campanhas.find((c) => c.id === servidor.campanhaAtualId)
  if (servidor.fase !== 'conectado' || !campanha) return null
  return campanha
}

// O relógio do histórico ("hoje" ou outro dia) anda de minuto em minuto, fora da renderização.
const assinarRelogio = (avisar: () => void) => {
  const id = setInterval(avisar, 30_000)
  return () => clearInterval(id)
}
const minutoAtual = () => Math.floor(Date.now() / 60_000) * 60_000

export function TelaDados() {
  const servidor = useServidor()
  const campanha = campanhaAberta(servidor)
  // Cada sessão (servidor, conta, campanha e papel) tem a própria mesa: trocar qualquer um deles monta
  // uma mesa nova, e a antiga fecha e para de ouvir o servidor.
  const chave = campanha ? `${servidor.endereco}|${servidor.usuario?.id ?? ''}|${campanha.id}|${campanha.papel}` : 'local'
  return <Mesa key={chave} servidor={servidor} naCampanha={Boolean(campanha)} />
}

function Mesa({ servidor, naCampanha }: { servidor: EstadoServidor; naCampanha: boolean }) {
  const [mesa] = useState(
    () =>
      new MesaDados(() => (naCampanha ? abrirRepositorioDados() : null) ?? new RepositorioDadosLocal(), {
        esperaMinima: prefereMenosMovimento() ? 0 : GIRO_MINIMO,
      }),
  )
  useEffect(() => {
    void mesa.abrir()
    return () => {
      void mesa.fechar()
    }
  }, [mesa])
  const estado = useSyncExternalStore(mesa.assinar, () => mesa.estado)
  const agora = useSyncExternalStore(assinarRelogio, minutoAtual)
  const [emSegredo, setEmSegredo] = useState(false)
  const secreta = emSegredo && estado.podeRolarEmSegredo
  const nome = (r: Rolagem) => nomeDeQuemRolou(r.autorId, servidor.usuario?.id ?? null, servidor.usuarios)

  return (
    <div className="dados">
      <div className={`dados__folha${secreta ? ' dados__folha--segredo' : ''}`}>
        <header className="dados__cabecalho">
          <div className="dados__quem">
            <h1 className="dados__titulo">Dados</h1>
            <p className="dados__dica">{contexto(servidor, estado)}</p>
          </div>
          {estado.podeRolarEmSegredo && (
            <button type="button" className="botao-topo dados__segredo" aria-pressed={emSegredo} onClick={() => setEmSegredo(!emSegredo)}>
              <IconeSegredo />
              Rolar em segredo
            </button>
          )}
        </header>

        {servidor.semResposta && estado.compartilhado && (
          <p className="dados__aviso">A conexão com o servidor caiu. As rolagens dos outros aparecem quando ela voltar.</p>
        )}

        <Pano estado={estado} secreta={secreta} />

        <div className="dados__bandeja" role="group" aria-label="Dados para rolar">
          {LADOS.map((lados) => (
            <button
              key={lados}
              type="button"
              className="dados__botao"
              aria-label={`Rolar d${lados}${secreta ? ' em segredo' : ''}`}
              onClick={() => void mesa.rolar(lados, secreta)}
            >
              <FormaDado lados={lados} />
              <span className="dados__rotulo">d{lados}</span>
            </button>
          ))}
        </div>
        {secreta && <p className="dados__dica">Em segredo: só os mestres da campanha veem estas rolagens.</p>}

        <p className="dados__erro" role="alert">
          {estado.erro ?? ''}
        </p>

        <Historico estado={estado} nome={nome} agora={agora} />
      </div>
    </div>
  )
}

function contexto(servidor: EstadoServidor, estado: EstadoMesa): string {
  const campanha = campanhaAberta(servidor)
  if (campanha && estado.compartilhado) return `Rolagens da campanha ${campanha.nome}. Todos que participam veem o resultado.`
  if (servidor.fase === 'iniciando' || servidor.fase === 'entrando') return 'Entrando no servidor. Até lá, as rolagens ficam só neste aparelho.'
  if (servidor.fase === 'conectado') return 'Escolha uma campanha na aba Campanha para rolar com o grupo. Por enquanto, as rolagens ficam só neste aparelho.'
  return 'Sem entrar no servidor, as rolagens ficam só neste aparelho. Para rolar com o grupo, entre na aba Campanha.'
}

/** O pedaço de feltro onde o dado cai, com o resultado grande. A legenda é anunciada pelo leitor de tela. */
function Pano({ estado, secreta }: { estado: EstadoMesa; secreta: boolean }) {
  const rolando = estado.rolando
  const ultima = estado.ultima
  const lados: Lados | null = rolando ?? ultima?.lados ?? null
  const marca = ultima && !rolando ? extremo(ultima) : null

  let legenda = 'Toque num dado para rolar.'
  if (rolando) legenda = `Rolando o d${rolando}${secreta ? ' em segredo' : ''}.`
  else if (ultima) legenda = descreverRolagem(ultima, 'Você')

  return (
    <section className={`dados__pano${secreta ? ' dados__pano--segredo' : ''}`} aria-label="Última rolagem">
      {secreta && <span className="dados__selo">Em segredo</span>}
      {lados && (
        <div className={`dados__grande${rolando ? ' dados__grande--rolando' : ''}`} data-lados={lados} key={rolando ? 'rolando' : ultima?.id}>
          <FormaDado lados={lados} tamanho={112} className="dados__forma" cheio />
          {!rolando && ultima && <span className={`dados__numero${marca ? ` dados__numero--${marca}` : ''}`}>{ultima.resultado}</span>}
        </div>
      )}
      <p className="dados__legenda" role="status">
        {legenda}
      </p>
    </section>
  )
}

function Historico({ estado, nome, agora }: { estado: EstadoMesa; nome: (r: Rolagem) => string; agora: number }) {
  return (
    <section className="dados__historico" aria-labelledby="dados-historico">
      <h2 className="dados__subtitulo" id="dados-historico">
        Últimas rolagens
      </h2>
      {estado.carregando ? (
        <p className="dados__dica">Buscando as últimas rolagens.</p>
      ) : estado.historico.length === 0 ? (
        <p className="dados__dica">Nenhuma rolagem ainda.</p>
      ) : (
        <ol className="dados__lista">
          {estado.historico.map((r) => {
            const quem = nome(r)
            const marca = extremo(r)
            return (
              <li key={r.id} className="dados__linha">
                <span className="dados__oculto">
                  {descreverRolagem(r, quem)} {formatarHora(r.quando, agora)}.
                </span>
                <span className="dados__autor" aria-hidden="true">
                  {quem}
                  {r.secreta && <span className="dados__marca">segredo</span>}
                </span>
                <span className="dados__qual" aria-hidden="true">
                  d{r.lados}
                </span>
                <span className={`dados__valor${marca ? ` dados__valor--${marca}` : ''}`} aria-hidden="true">
                  {r.resultado}
                </span>
                <span className="dados__hora" aria-hidden="true">
                  {formatarHora(r.quando, agora)}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
