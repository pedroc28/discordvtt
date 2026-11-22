// Regiões: a lista (com a região que a ferramenta Região vai pintar) e o editor de uma região.

import { useState } from 'react'
import type { ControladorMapa } from './controlador'
import { Icone } from './Icones'
import { CORES_REGIAO, arvoreDeRegioes, podeSerPai } from './operacoes'
import { useRascunho, useVersaoDasRegioes } from './rascunho'

interface PropsLista {
  ctrl: ControladorMapa
  /** Região que será pintada. Null = tirar da região. Undefined = ainda não escolheu. */
  ativa: string | null | undefined
  aoEscolher: (id: string | null) => void
  aoEditar: (id: string) => void
  aoCriar: () => void
}

export function ListaDeRegioes({ ctrl, ativa, aoEscolher, aoEditar, aoCriar }: PropsLista) {
  useVersaoDasRegioes(ctrl.armazem)
  const arvore = arvoreDeRegioes(ctrl.armazem.listarRegioes())
  return (
    <div className="mapa-regioes">
      <button type="button" className="mapa-regiao mapa-regiao--nenhuma" aria-pressed={ativa === null} onClick={() => aoEscolher(null)} title="Pinte para tirar hexágonos de qualquer região">
        <Icone nome="borracha" tamanho={14} />
        <span>Sem região</span>
      </button>
      {arvore.map(({ regiao, nivel }) => (
        <div className="mapa-regiao-linha" key={regiao.id} style={{ paddingLeft: nivel * 14 }}>
          <button type="button" className="mapa-regiao" aria-pressed={ativa === regiao.id} onClick={() => aoEscolher(regiao.id)} title={regiao.nome}>
            <span className="mapa-regiao__cor" style={{ background: regiao.cor }} />
            <span className="mapa-regiao__nome">{regiao.nome || 'Sem nome'}</span>
          </button>
          <button type="button" className="botao-icone" aria-label={`Editar região ${regiao.nome}`} title="Editar região" onClick={() => aoEditar(regiao.id)}>
            <Icone nome="pincel" tamanho={15} />
          </button>
        </div>
      ))}
      <button type="button" className="botao-topo mapa-regioes__nova" onClick={aoCriar} disabled={!ctrl.armazem.regioesProntas}>
        <Icone nome="mais" tamanho={14} /> Nova região
      </button>
      {arvore.length === 0 && <p className="mapa-painel__dica">Nenhuma região ainda. Crie uma e pinte os hexágonos para marcar a área dela.</p>}
      {ativa === undefined && arvore.length > 0 && <p className="mapa-painel__dica">Escolha uma região para pintar.</p>}
    </div>
  )
}

interface PropsEditor {
  ctrl: ControladorMapa
  id: string
  aoFechar: () => void
}

export function EditorDeRegiao({ ctrl, id, aoFechar }: PropsEditor) {
  const armazem = ctrl.armazem
  useVersaoDasRegioes(armazem)
  const regiao = armazem.lerRegiao(id)
  const [confirmando, setConfirmando] = useState(false)

  const nome = useRascunho(regiao?.nome ?? '', (v) => ctrl.editarRegiao(id, { nome: v }, `nome:${id}`))
  const descricao = useRascunho(regiao?.descricao ?? '', (v) => ctrl.editarRegiao(id, { descricao: v }, `descricao:${id}`))

  if (!regiao) {
    return (
      <aside className="mapa__inspetor" aria-label="Região">
        <header className="mapa-painel__topo">
          <h2>Região</h2>
          <button type="button" className="botao-icone" aria-label="Fechar painel" onClick={aoFechar}>
            <Icone nome="fechar" />
          </button>
        </header>
        <p className="mapa-painel__vazio">Esta região foi excluída.</p>
      </aside>
    )
  }

  const possiveisPais = arvoreDeRegioes(armazem.listarRegioes()).filter(({ regiao: r }) => r.id !== id && podeSerPai(armazem, id, r.id))

  return (
    <aside className="mapa__inspetor" aria-label="Editar região">
      <header className="mapa-painel__topo">
        <h2>Região</h2>
        <button type="button" className="botao-icone" aria-label="Fechar painel" title="Fechar (Esc)" onClick={aoFechar}>
          <Icone nome="fechar" />
        </button>
      </header>
      <div className="mapa-painel__corpo">
        <label className="mapa-campo">
          <span>Nome</span>
          <input type="text" value={nome.valor} placeholder="Sem nome" maxLength={80} onChange={(e) => nome.aoMudar(e.target.value)} onBlur={nome.aoDesfocar} />
        </label>

        <div className="mapa-campo">
          <span>Cor</span>
          <div className="mapa-cores">
            {CORES_REGIAO.map((c) => (
              <button
                key={c}
                type="button"
                className="mapa-cores__amostra"
                style={{ background: c }}
                aria-label={`Cor ${c}`}
                aria-pressed={regiao.cor.toLowerCase() === c}
                onClick={() => ctrl.editarRegiao(id, { cor: c }, `cor:${id}`)}
              />
            ))}
            <input
              type="color"
              className="mapa-cores__livre"
              value={regiao.cor}
              aria-label="Outra cor"
              onChange={(e) => ctrl.editarRegiao(id, { cor: e.target.value }, `cor:${id}`)}
            />
          </div>
        </div>

        <label className="mapa-campo">
          <span>Faz parte de</span>
          <select value={regiao.paiId && armazem.lerRegiao(regiao.paiId) ? regiao.paiId : ''} onChange={(e) => ctrl.editarRegiao(id, { paiId: e.target.value || null })}>
            <option value="">Nada (região de topo)</option>
            {possiveisPais.map(({ regiao: r, nivel }) => (
              <option key={r.id} value={r.id}>
                {' '.repeat(nivel)}
                {r.nome || 'Sem nome'}
              </option>
            ))}
          </select>
        </label>

        <label className="mapa-campo mapa-campo--nota">
          <span>Descrição</span>
          <textarea value={descricao.valor} rows={5} placeholder="Quem manda aqui, o que se sabe sobre a região" onChange={(e) => descricao.aoMudar(e.target.value)} onBlur={descricao.aoDesfocar} />
        </label>

        <div className="mapa-painel__perigo">
          {confirmando ? (
            <>
              <p>Excluir esta região? Os hexágonos ficam, só deixam de pertencer a ela. Dá para desfazer.</p>
              <div className="mapa-painel__linha">
                <button
                  type="button"
                  className="botao-topo mapa-botao-perigo"
                  onClick={() => {
                    ctrl.excluirRegiao(id)
                    aoFechar()
                  }}
                >
                  Excluir
                </button>
                <button type="button" className="botao-topo" onClick={() => setConfirmando(false)}>
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="botao-topo" onClick={() => setConfirmando(true)}>
              <Icone nome="lixeira" tamanho={14} /> Excluir região
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
