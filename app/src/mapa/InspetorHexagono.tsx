// Painel do hexágono selecionado: nome, terreno, região, marcadores e nota.
// Direita no desktop; no celular sobe da base da tela.

import { useCallback, useState, useSyncExternalStore } from 'react'
import type { ControladorMapa } from './controlador'
import { novoId } from './controlador'
import { chaveChunk, type Hex } from './hex'
import { Icone } from './Icones'
import { arvoreDeRegioes } from './operacoes'
import { useRascunho, useVersaoDasRegioes, useVersaoDoMapa } from './rascunho'
import type { Marcador } from './tipos'
import type { Tileset } from './tileset'

interface Props {
  ctrl: ControladorMapa
  tileset: Tileset
  hex: Hex
  aoFechar: () => void
  /** Falso quando o mestre escolheu ver como jogador: a seção só do mestre some. */
  comMestre?: boolean
}

export function InspetorHexagono({ ctrl, tileset, hex, aoFechar, comMestre = true }: Props) {
  const armazem = ctrl.armazem
  useVersaoDoMapa(armazem)
  useVersaoDasRegioes(armazem)
  const h = armazem.ler(hex.q, hex.r)
  const regioes = arvoreDeRegioes(armazem.listarRegioes())
  const [tipoNovo, setTipoNovo] = useState(tileset.def.marcadores[0]?.id ?? '')

  const nome = useRascunho(h?.nome ?? '', (v) => ctrl.editarHexagono(hex.q, hex.r, { nome: v }, `nome:${hex.q},${hex.r}`))
  const nota = useRascunho(h?.nota ?? '', (v) => ctrl.editarHexagono(hex.q, hex.r, { nota: v }, `nota:${hex.q},${hex.r}`))

  const editarMarcadores = (marcadores: Marcador[], grupo?: string) =>
    ctrl.editarHexagono(hex.q, hex.r, { marcadores }, grupo)

  return (
    <aside className="mapa__inspetor" aria-label="Hexágono selecionado">
      <header className="mapa-painel__topo">
        <h2>
          Hexágono <span className="mapa-painel__coord">{hex.q}, {hex.r}</span>
        </h2>
        <button type="button" className="botao-icone" aria-label="Fechar painel" title="Fechar (Esc)" onClick={aoFechar}>
          <Icone nome="fechar" />
        </button>
      </header>

      <div className="mapa-painel__corpo">
      {!h ? (
        <p className="mapa-painel__vazio">
          Este hexágono está vazio. Use a ferramenta Pintar para construir terreno aqui, e depois volte para dar nome e anotar.
        </p>
      ) : (
        <>
          <label className="mapa-campo">
            <span>Nome</span>
            <input
              type="text"
              value={nome.valor}
              placeholder="Sem nome"
              maxLength={80}
              onChange={(e) => nome.aoMudar(e.target.value)}
              onBlur={nome.aoDesfocar}
            />
          </label>

          <label className="mapa-campo">
            <span>Terreno</span>
            <select value={h.terreno} onChange={(e) => ctrl.editarHexagono(hex.q, hex.r, { terreno: e.target.value })}>
              {!tileset.terreno(h.terreno) && <option value={h.terreno}>{h.terreno}</option>}
              {tileset.def.terrenos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="mapa-campo">
            <span>Região</span>
            <select
              value={h.regiaoId && armazem.lerRegiao(h.regiaoId) ? h.regiaoId : ''}
              onChange={(e) => ctrl.editarHexagono(hex.q, hex.r, { regiaoId: e.target.value || null })}
            >
              <option value="">Nenhuma</option>
              {regioes.map(({ regiao, nivel }) => (
                <option key={regiao.id} value={regiao.id}>
                  {' '.repeat(nivel)}
                  {regiao.nome || 'Sem nome'}
                </option>
              ))}
            </select>
          </label>

          <section className="mapa-campo" aria-label="Marcadores">
            <span>Marcadores</span>
            {h.marcadores.length === 0 && <p className="mapa-painel__dica">Nenhum marcador neste hexágono.</p>}
            <ul className="mapa-marcadores">
              {h.marcadores.map((m) => (
                <LinhaMarcador
                  key={m.id}
                  marcador={m}
                  tileset={tileset}
                  aoRenomear={(v) =>
                    editarMarcadores(
                      h.marcadores.map((x) => (x.id === m.id ? { ...x, nome: v } : x)),
                      `marcador:${m.id}`,
                    )
                  }
                  aoRemover={() => editarMarcadores(h.marcadores.filter((x) => x.id !== m.id))}
                />
              ))}
            </ul>
            {tileset.def.marcadores.length > 0 && (
              <div className="mapa-marcadores__novo">
                <select value={tipoNovo} onChange={(e) => setTipoNovo(e.target.value)} aria-label="Tipo do novo marcador">
                  {tileset.def.marcadores.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="botao-topo"
                  onClick={() => editarMarcadores([...h.marcadores, { id: novoId(), tipo: tipoNovo, nome: '' }])}
                >
                  <Icone nome="mais" tamanho={14} /> Adicionar
                </button>
              </div>
            )}
          </section>

          <label className="mapa-campo mapa-campo--nota">
            <span>Nota</span>
            <textarea
              value={nota.valor}
              rows={6}
              placeholder="O que os personagens sabem ou descobriram aqui"
              onChange={(e) => nota.aoMudar(e.target.value)}
              onBlur={nota.aoDesfocar}
            />
          </label>
        </>
      )}
      {ctrl.mestre && comMestre && <SecaoMestre ctrl={ctrl} tileset={tileset} hex={hex} />}
      </div>
    </aside>
  )
}

/** O que só o mestre vê neste hexágono: a nota privada e o hexágono oculto, com ocultar e revelar. */
function SecaoMestre({ ctrl, tileset, hex }: { ctrl: ControladorMapa; tileset: Tileset; hex: Hex }) {
  const m = ctrl.mestre!
  useVersaoDoMapa(m.ocultos)
  useSyncExternalStore(
    useCallback((cb: () => void) => m.notas.ouvir(cb), [m]),
    () => m.notas.versao,
  )
  const publico = ctrl.armazem.ler(hex.q, hex.r)
  const oculto = m.ocultos.ler(hex.q, hex.r)
  const nota = m.notas.ler(hex.q, hex.r)
  const [tipoNovo, setTipoNovo] = useState(tileset.def.marcadores[0]?.id ?? '')
  const pronto = m.temChunk(chaveChunk(hex))

  const rascunhoNota = useRascunho(nota?.texto ?? '', (v) => ctrl.editarNota(hex.q, hex.r, v, `notamestre:${hex.q},${hex.r}`))
  const rascunhoNome = useRascunho(oculto?.nome ?? '', (v) => ctrl.editarOculto(hex.q, hex.r, { nome: v }, `nomeoculto:${hex.q},${hex.r}`))
  const editarMarcadores = (marcadores: Marcador[], grupo?: string) => ctrl.editarOculto(hex.q, hex.r, { marcadores }, grupo)

  const removerOculto = () => {
    const t = ctrl.iniciarTraco('oculta')
    t.apagar([hex])
    t.confirmar()
  }

  return (
    <section className="mapa-mestre" aria-label="Só o mestre vê">
      <h3 className="mapa-mestre__titulo">Só o mestre vê</h3>

      <label className="mapa-campo mapa-campo--nota">
        <span>Nota do mestre</span>
        <textarea
          value={rascunhoNota.valor}
          rows={4}
          disabled={!pronto}
          placeholder="Segredos, ganchos e o que acontece aqui. Os jogadores não recebem esta nota."
          onChange={(e) => rascunhoNota.aoMudar(e.target.value)}
          onBlur={rascunhoNota.aoDesfocar}
        />
      </label>

      {oculto ? (
        <div className="mapa-mestre__oculto">
          <p className="mapa-painel__dica">
            Há um hexágono oculto aqui. Os jogadores veem {publico ? `o terreno público (${tileset.terreno(publico.terreno)?.nome ?? publico.terreno})` : 'o espaço vazio'}.
          </p>
          <label className="mapa-campo">
            <span>Nome do oculto</span>
            <input
              type="text"
              value={rascunhoNome.valor}
              placeholder="Sem nome"
              maxLength={80}
              onChange={(e) => rascunhoNome.aoMudar(e.target.value)}
              onBlur={rascunhoNome.aoDesfocar}
            />
          </label>
          <label className="mapa-campo">
            <span>Terreno do oculto</span>
            <select value={oculto.terreno} onChange={(e) => ctrl.editarOculto(hex.q, hex.r, { terreno: e.target.value })}>
              {!tileset.terreno(oculto.terreno) && <option value={oculto.terreno}>{oculto.terreno}</option>}
              {tileset.def.terrenos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
          <section className="mapa-campo" aria-label="Marcadores do oculto">
            <span>Marcadores do oculto</span>
            <ul className="mapa-marcadores">
              {oculto.marcadores.map((mc) => (
                <LinhaMarcador
                  key={mc.id}
                  marcador={mc}
                  tileset={tileset}
                  aoRenomear={(v) => editarMarcadores(oculto.marcadores.map((x) => (x.id === mc.id ? { ...x, nome: v } : x)), `marcadoroculto:${mc.id}`)}
                  aoRemover={() => editarMarcadores(oculto.marcadores.filter((x) => x.id !== mc.id))}
                />
              ))}
            </ul>
            {tileset.def.marcadores.length > 0 && (
              <div className="mapa-marcadores__novo">
                <select value={tipoNovo} onChange={(e) => setTipoNovo(e.target.value)} aria-label="Tipo do novo marcador oculto">
                  {tileset.def.marcadores.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
                <button type="button" className="botao-topo" onClick={() => editarMarcadores([...oculto.marcadores, { id: novoId(), tipo: tipoNovo, nome: '' }])}>
                  <Icone nome="mais" tamanho={14} /> Adicionar
                </button>
              </div>
            )}
          </section>
          <div className="mapa-mestre__acoes">
            <button
              type="button"
              className="botao-topo"
              title="Os jogadores passam a ver este hexágono, no lugar do que há aí agora"
              onClick={() => ctrl.revelar([hex])}
            >
              Revelar aos jogadores
            </button>
            <button type="button" className="botao-topo" title="Apaga o hexágono oculto. Dá para desfazer" onClick={removerOculto}>
              Remover oculto
            </button>
          </div>
        </div>
      ) : publico ? (
        <div className="mapa-mestre__acoes">
          <button
            type="button"
            className="botao-topo"
            disabled={!pronto}
            title="Tira este hexágono do mapa dos jogadores e o guarda na camada oculta"
            onClick={() => ctrl.ocultar([hex])}
          >
            Ocultar este hexágono
          </button>
        </div>
      ) : (
        <p className="mapa-painel__dica">Para esconder um lugar ainda não descoberto, escolha a camada Oculta na barra e pinte aqui.</p>
      )}
    </section>
  )
}

function LinhaMarcador({
  marcador,
  tileset,
  aoRenomear,
  aoRemover,
}: {
  marcador: Marcador
  tileset: Tileset
  aoRenomear: (nome: string) => void
  aoRemover: () => void
}) {
  const rascunho = useRascunho(marcador.nome, aoRenomear)
  const def = tileset.marcador(marcador.tipo)
  const url = tileset.urlMarcador(marcador.tipo)
  return (
    <li className="mapa-marcadores__linha">
      {url ? <img src={url} alt="" draggable={false} /> : <span className="mapa-marcadores__sem-icone" />}
      <input
        type="text"
        value={rascunho.valor}
        placeholder={def?.nome ?? marcador.tipo}
        maxLength={60}
        aria-label={`Nome do marcador ${def?.nome ?? marcador.tipo}`}
        onChange={(e) => rascunho.aoMudar(e.target.value)}
        onBlur={rascunho.aoDesfocar}
      />
      <button type="button" className="botao-icone botao-icone--perigo" aria-label="Remover marcador" title="Remover marcador" onClick={aoRemover}>
        <Icone nome="lixeira" />
      </button>
    </li>
  )
}
