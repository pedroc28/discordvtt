// Painel "Imagens da campanha": enviar, pôr no quadro, renomear e apagar.

import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { EstadoQuadro, QuadroEstado } from './estado'
import { IconeEnviar, IconeFechar, IconeImagens } from './icones'
import { espacoUsado, formatarMB, podeGerirImagem } from './operacoes'
import { LIMITES_QUADRO, type ImagemQuadro } from './tipos'

interface Props {
  quadro: QuadroEstado
  estado: EstadoQuadro
  eu: string | null
  /** Onde o que for enviado ou preso entra: o meio da tela. */
  centro: () => { x: number; y: number }
  aoAbrir: (imagemId: string) => void
  aoFechar: () => void
}

export function Biblioteca({ quadro, estado, eu, centro, aoAbrir, aoFechar }: Props) {
  const usado = espacoUsado(estado.imagens)

  const escolher = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivos = [...(e.target.files ?? [])]
    // Limpa a escolha, para escolher o mesmo arquivo de novo funcionar.
    e.target.value = ''
    void quadro.enviar(arquivos, centro())
  }

  return (
    <aside className="quadro__biblioteca" aria-labelledby="quadro-biblioteca">
      <div className="quadro__biblioteca-topo">
        <h2 className="quadro__subtitulo" id="quadro-biblioteca">
          Imagens da campanha
        </h2>
        <button type="button" className="botao-icone" aria-label="Fechar as imagens" onClick={aoFechar}>
          <IconeFechar />
        </button>
      </div>

      <label className="botao-topo botao-topo--principal quadro__enviar">
        <IconeEnviar />
        Enviar imagem
        <input type="file" accept="image/png,image/jpeg,image/webp,image/*" multiple className="quadro__oculto" onChange={escolher} />
      </label>
      <p className="quadro__dica" role="status">
        {estado.enviando > 0
          ? `Enviando ${estado.enviando} ${estado.enviando === 1 ? 'imagem' : 'imagens'}.`
          : 'A imagem enviada vai para o quadro e fica guardada aqui.'}{' '}
        Usado: {formatarMB(usado)} de {formatarMB(LIMITES_QUADRO.bytesCampanha)}.
      </p>

      {estado.imagens.length === 0 ? (
        <p className="quadro__dica">Nenhuma imagem ainda.</p>
      ) : (
        <ul className="quadro__galeria">
          {estado.imagens.map((imagem) => (
            <Cartao
              key={imagem.id}
              imagem={imagem}
              url={estado.miniaturas[imagem.id]}
              pode={podeGerirImagem(imagem, eu, estado.ehMestre)}
              naoPresa={!estado.itens.some((i) => i.tipo === 'imagem' && i.imagemId === imagem.id)}
              aoAbrir={() => aoAbrir(imagem.id)}
              aoPrender={() => void quadro.prender(imagem.id, centro())}
              aoRenomear={(nome) => void quadro.renomear(imagem.id, nome)}
              aoApagar={() => void quadro.apagarImagem(imagem.id)}
            />
          ))}
        </ul>
      )}
    </aside>
  )
}

interface PropsCartao {
  imagem: ImagemQuadro
  url: string | undefined
  pode: boolean
  naoPresa: boolean
  aoAbrir: () => void
  aoPrender: () => void
  aoRenomear: (nome: string) => void
  aoApagar: () => void
}

function Cartao({ imagem, url, pode, naoPresa, aoAbrir, aoPrender, aoRenomear, aoApagar }: PropsCartao) {
  const [modo, setModo] = useState<'normal' | 'renomear' | 'apagar'>('normal')
  const [nome, setNome] = useState(imagem.nome)
  const titulo = imagem.nome || 'Sem nome'

  const salvar = (e: FormEvent) => {
    e.preventDefault()
    aoRenomear(nome)
    setModo('normal')
  }

  return (
    <li className="quadro__cartao">
      <button type="button" className="quadro__miniatura" aria-label={`Abrir a imagem ${titulo}`} onClick={aoAbrir}>
        {url ? <img src={url} alt="" draggable={false} /> : <IconeImagens />}
      </button>

      {modo === 'renomear' ? (
        <form className="quadro__cartao-corpo" onSubmit={salvar}>
          <label className="quadro__campo">
            <span>Nome da imagem</span>
            <input type="text" value={nome} maxLength={LIMITES_QUADRO.nomeImagem} autoFocus onChange={(e) => setNome(e.target.value)} />
          </label>
          <div className="quadro__linha">
            <button type="submit" className="botao-topo">
              Salvar nome
            </button>
            <button type="button" className="botao-topo" onClick={() => setModo('normal')}>
              Cancelar
            </button>
          </div>
        </form>
      ) : modo === 'apagar' ? (
        <div className="quadro__cartao-corpo">
          <p className="quadro__aviso-texto">Apagar "{titulo}"? Ela sai do quadro também, e não dá para desfazer.</p>
          <div className="quadro__linha">
            <button
              type="button"
              className="botao-topo quadro__botao-perigo"
              onClick={() => {
                setModo('normal')
                aoApagar()
              }}
            >
              Apagar imagem
            </button>
            <button type="button" className="botao-topo" onClick={() => setModo('normal')}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="quadro__cartao-corpo">
          <p className="quadro__cartao-nome" title={titulo}>
            {titulo}
          </p>
          <div className="quadro__linha">
            <button type="button" className="botao-topo" onClick={aoPrender}>
              {naoPresa ? 'Pôr no quadro' : 'Pôr outra cópia'}
            </button>
            {pode && (
              <>
                <button
                  type="button"
                  className="botao-topo"
                  onClick={() => {
                    setNome(imagem.nome)
                    setModo('renomear')
                  }}
                >
                  Renomear
                </button>
                <button type="button" className="botao-topo" onClick={() => setModo('apagar')}>
                  Apagar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
