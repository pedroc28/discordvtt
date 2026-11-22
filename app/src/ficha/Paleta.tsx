import { DEF, DEFINICOES } from './campos'
import { TIPO_ARRASTE } from './Folha'
import { IconeCampo } from './Icones'
import type { Elemento, Pagina, TipoCampo } from './tipos'

function nomeDoElemento(el: Elemento): string {
  if (el.tipo === 'titulo') return (el.config.texto || 'Texto fixo').split('\n')[0]
  return el.rotulo || DEF[el.tipo].nome
}

interface Props {
  pagina: Pagina
  selecao: string[]
  adicionar: (tipo: TipoCampo) => void
  selecionar: (id: string, somar: boolean) => void
}

export function Paleta({ pagina, selecao, adicionar, selecionar }: Props) {
  return (
    <div className="paleta">
      <section className="painel__secao">
        <h2 className="painel__titulo">Adicionar campo</h2>
        <p className="painel__dica">Arraste para a folha, ou clique para pôr no meio da tela.</p>
        <ul className="paleta__grade">
          {DEFINICOES.map((d) => (
            <li key={d.tipo}>
              <button
                type="button"
                className="paleta__item"
                draggable
                title={d.descricao}
                onDragStart={(e) => {
                  e.dataTransfer.setData(TIPO_ARRASTE, d.tipo)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => adicionar(d.tipo)}
              >
                <IconeCampo tipo={d.tipo} tamanho={18} />
                <span>{d.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="painel__secao painel__secao--crescer">
        <h2 className="painel__titulo">
          Nesta página <span className="contagem">{pagina.elementos.length}</span>
        </h2>
        {pagina.elementos.length === 0 ? (
          <p className="painel__dica">A página está vazia. Comece por uma moldura ou pelo nome do personagem.</p>
        ) : (
          <ul className="camadas">
            {[...pagina.elementos].reverse().map((el) => (
              <li key={el.id}>
                <button
                  type="button"
                  className={`camada${selecao.includes(el.id) ? ' camada--sel' : ''}`}
                  onClick={(e) => selecionar(el.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                >
                  <IconeCampo tipo={el.tipo} />
                  <span className="camada__nome">{nomeDoElemento(el)}</span>
                  {el.chave && <code className="chave">{el.chave}</code>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
