// Tela principal: barra do topo, paleta, folha, inspetor e abas de páginas.

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import {
  carregarModelo,
  carregarValores,
  modeloEmBranco,
  normalizarModelo,
  normalizarPersonagem,
  salvarModelo,
  salvarValores,
} from './armazenamento'
import { criarElemento, DEF } from './campos'
import { modeloExemplo } from './exemplo'
import { coresDaFolha, useAparencia, type Tema } from './aparencia'
import { DialogoExportar } from './DialogoExportar'
import { Folha } from './Folha'
import { iniciarHistorico, reduzirHistorico } from './historico'
import { Icone } from './Icones'
import { Alternar, Inspetor, Segmentos } from './Inspetor'
import {
  adicionarElementos,
  adicionarPagina,
  alinhar,
  atualizarElementos,
  distribuir,
  duplicarElementos,
  igualarTamanho,
  moverElementos,
  removerElementos,
  removerPagina,
  renomearPagina,
  reordenar,
} from './operacoes'
import { Paleta } from './Paleta'
import type { Elemento, Modelo, Modo, Personagem, TipoCampo, Valor, Valores } from './tipos'
import { arredondarGrade, chaveEhAutomatica, chaveUnica, slug, usosDeChaves } from './util'

const NIVEIS_ZOOM = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

interface Aviso {
  texto: string
  acao?: { rotulo: string; f: () => void }
}

const ehCampoDeTexto = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

export function EditorDeFichas() {
  const [hist, despachar] = useReducer(reduzirHistorico, null, () =>
    iniciarHistorico(carregarModelo() ?? modeloExemplo()),
  )
  const modelo = hist.presente
  const aplicar = useCallback(
    (f: (m: Modelo) => Modelo, grupo?: string) => despachar({ tipo: 'aplicar', f, grupo, tempo: Date.now() }),
    [],
  )
  const substituirModelo = (m: Modelo) => despachar({ tipo: 'substituir', modelo: m })

  // ----- valores do personagem (um conjunto por modelo) -----
  const [dados, setDados] = useState<{ id: string; valores: Valores }>(() => ({
    id: modelo.id,
    valores: carregarValores(modelo.id),
  }))
  if (dados.id !== modelo.id) setDados({ id: modelo.id, valores: carregarValores(modelo.id) })
  const valores = dados.valores
  const definirValor = useCallback(
    (chave: string, v: Valor) => setDados((d) => ({ ...d, valores: { ...d.valores, [chave]: v } })),
    [],
  )
  const substituirValores = (v: Valores) => setDados((d) => ({ ...d, valores: v }))

  // ----- estado da interface -----
  const [modo, setModo] = useState<Modo>('editar')
  const [paginaId, setPaginaId] = useState(modelo.paginas[0].id)
  const pagina = modelo.paginas.find((p) => p.id === paginaId) ?? modelo.paginas[0]
  const [selecaoBruta, setSelecao] = useState<string[]>([])
  const selecao = modo === 'editar' ? selecaoBruta.filter((id) => pagina.elementos.some((e) => e.id === id)) : []
  const selecionados = selecao
    .map((id) => pagina.elementos.find((e) => e.id === id))
    .filter((e): e is Elemento => !!e)
  const [zoom, setZoom] = useState(1)
  const [zoomAuto, setZoomAuto] = useState(true)
  const [mostrarGrade, setMostrarGrade] = useState(true)
  const [painel, setPainel] = useState<'esq' | 'dir' | null>(null)
  const [aberto, setAberto] = useState<'arquivo' | 'aparencia' | null>(null)
  const aparencia = useAparencia()
  const cores = coresDaFolha(modelo, aparencia.escuro && !aparencia.folhaClara)
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [exportando, setExportando] = useState<{ titulo: string; nome: string; conteudo: string } | null>(null)
  const area = useRef<Elemento[]>([])

  const rolagemRef = useRef<HTMLDivElement>(null)
  const folhaRef = useRef<HTMLDivElement>(null)
  const entradaModelo = useRef<HTMLInputElement>(null)
  const entradaPersonagem = useRef<HTMLInputElement>(null)

  const avisar = useCallback((texto: string, acao?: Aviso['acao']) => setAviso({ texto, acao }), [])
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), aviso.acao ? 7000 : 4000)
    return () => clearTimeout(t)
  }, [aviso])

  // ----- salvar no navegador -----
  const falhouAoSalvar = useRef(false)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!salvarModelo(modelo) && !falhouAoSalvar.current) {
        falhouAoSalvar.current = true
        avisar('O navegador não deixou salvar o modelo. Use Arquivo, Exportar modelo para não perder nada.')
      }
    }, 400)
    return () => clearTimeout(t)
  }, [modelo, avisar])
  useEffect(() => {
    const t = setTimeout(() => {
      if (!salvarValores(dados.id, dados.valores) && !falhouAoSalvar.current) {
        falhouAoSalvar.current = true
        avisar('Não coube no navegador, provavelmente por causa de uma imagem grande. Exporte o personagem em JSON.')
      }
    }, 400)
    return () => clearTimeout(t)
  }, [dados, avisar])

  // ----- zoom -----
  const ajustarZoom = useCallback(() => {
    const r = rolagemRef.current
    if (!r) return
    const folga = r.clientWidth < 600 ? 24 : 96
    setZoom(Math.max(0.25, Math.min(1, (r.clientWidth - folga) / modelo.largura)))
  }, [modelo.largura])

  useLayoutEffect(() => {
    if (!zoomAuto) return
    ajustarZoom()
    const r = rolagemRef.current
    if (!r) return
    const obs = new ResizeObserver(() => ajustarZoom())
    obs.observe(r)
    return () => obs.disconnect()
  }, [zoomAuto, ajustarZoom, modo])

  const passoZoom = (dir: 1 | -1) => {
    setZoomAuto(false)
    setZoom((z) => {
      if (dir > 0) return NIVEIS_ZOOM.find((n) => n > z + 0.001) ?? z
      return [...NIVEIS_ZOOM].reverse().find((n) => n < z - 0.001) ?? z
    })
  }

  useEffect(() => {
    const r = rolagemRef.current
    if (!r) return
    const roda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoomAuto(false)
      setZoom((z) => Math.max(0.25, Math.min(3, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))))
    }
    r.addEventListener('wheel', roda, { passive: false })
    return () => r.removeEventListener('wheel', roda)
  }, [])

  // ----- ações sobre campos -----
  const alterar = useCallback(
    (ids: string[], f: (e: Elemento) => Elemento, grupo?: string) =>
      aplicar((m) => atualizarElementos(m, ids, f), grupo),
    [aplicar],
  )

  const centroVisivel = () => {
    const r = rolagemRef.current?.getBoundingClientRect()
    const f = folhaRef.current?.getBoundingClientRect()
    if (!r || !f) return { x: modelo.largura / 2, y: modelo.altura / 2 }
    const x = (Math.max(r.left, f.left) + Math.min(r.right, f.right)) / 2
    const y = (Math.max(r.top, f.top) + Math.min(r.bottom, f.bottom)) / 2
    return { x: (x - f.left) / zoom, y: (y - f.top) / zoom }
  }

  const adicionarTipo = (tipo: TipoCampo, cx?: number, cy?: number) => {
    const d = DEF[tipo]
    const centro = cx === undefined || cy === undefined ? centroVisivel() : { x: cx, y: cy }
    let x = arredondarGrade(centro.x - d.w / 2, modelo.grade)
    let y = arredondarGrade(centro.y - d.h / 2, modelo.grade)
    // evita empilhar exatamente em cima de outro campo igual
    while (pagina.elementos.some((e) => e.x === x && e.y === y)) {
      x += modelo.grade || 8
      y += modelo.grade || 8
    }
    x = Math.max(0, Math.min(modelo.largura - d.w, x))
    y = Math.max(0, Math.min(modelo.altura - d.h, y))
    const el = criarElemento(tipo, x, y, modelo)
    aplicar((m) => adicionarElementos(m, pagina.id, [el], tipo === 'moldura'))
    setSelecao([el.id])
    setPainel(null)
  }

  /** Cria cópias com chaves novas (forca → forca_2) para não dividirem o mesmo valor. */
  const copiasComChavesNovas = (origem: Elemento[], deslocamento: number) => {
    const novas = duplicarElementos(origem, deslocamento)
    const reservadas: string[] = []
    for (const n of novas) {
      if (!n.chave) continue
      const base = n.chave.replace(/_\d+$/, '')
      n.chave = chaveUnica(base, modelo, undefined, reservadas)
      reservadas.push(n.chave)
      n.x = Math.max(0, Math.min(modelo.largura - n.w, n.x))
      n.y = Math.max(0, Math.min(modelo.altura - n.h, n.y))
    }
    return novas
  }

  const duplicar = () => {
    if (!selecionados.length) return
    const novas = copiasComChavesNovas(selecionados, modelo.grade * 2 || 16)
    aplicar((m) => adicionarElementos(m, pagina.id, novas))
    setSelecao(novas.map((n) => n.id))
  }

  const excluir = () => {
    if (!selecao.length) return
    const ids = selecao
    aplicar((m) => removerElementos(m, ids))
    setSelecao([])
  }

  const copiar = () => {
    if (selecionados.length) area.current = structuredClone(selecionados)
  }
  const colar = () => {
    if (!area.current.length) return
    const novas = copiasComChavesNovas(area.current, modelo.grade * 2 || 16)
    aplicar((m) => adicionarElementos(m, pagina.id, novas))
    area.current = novas.map((n) => structuredClone(n))
    setSelecao(novas.map((n) => n.id))
  }

  /** Muda a chave e leva junto o valor que já estava preenchido. */
  const mudarChave = (el: Elemento, nova: string) => {
    if (nova === el.chave) return
    alterar([el.id], (e) => ({ ...e, chave: nova }))
    if (el.chave && valores[el.chave] !== undefined && valores[nova] === undefined) {
      definirValor(nova, valores[el.chave])
    }
  }

  const renomearRotulo = (el: Elemento, rotulo: string) => {
    const def = DEF[el.tipo]
    if (def.temChave && chaveEhAutomatica(el.chave, el.rotulo) && rotulo.trim()) {
      const nova = chaveUnica(slug(rotulo), modelo, el.id)
      alterar([el.id], (e) => ({ ...e, rotulo, chave: nova }), `rotulo:${el.id}`)
      if (el.chave && valores[el.chave] !== undefined && valores[nova] === undefined) {
        definirValor(nova, valores[el.chave])
      }
    } else {
      alterar([el.id], (e) => ({ ...e, rotulo }), `rotulo:${el.id}`)
    }
  }

  // ----- teclado -----
  const teclado = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    teclado.current = (e: KeyboardEvent) => {
      if (ehCampoDeTexto(e.target) || exportando) return
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (modo !== 'editar') return
      if (ctrl && k === 'z') {
        e.preventDefault()
        despachar({ tipo: e.shiftKey ? 'refazer' : 'desfazer' })
      } else if (ctrl && k === 'y') {
        e.preventDefault()
        despachar({ tipo: 'refazer' })
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selecao.length) {
        e.preventDefault()
        excluir()
      } else if (ctrl && k === 'd') {
        e.preventDefault()
        duplicar()
      } else if (ctrl && k === 'c') {
        copiar()
      } else if (ctrl && k === 'v') {
        e.preventDefault()
        colar()
      } else if (ctrl && k === 'a') {
        e.preventDefault()
        setSelecao(pagina.elementos.map((x) => x.id))
      } else if (e.key === 'Escape') {
        setSelecao([])
        setAberto(null)
      } else if (e.key.startsWith('Arrow') && selecao.length) {
        e.preventDefault()
        const passo = e.shiftKey ? modelo.grade || 10 : 1
        const dx = e.key === 'ArrowLeft' ? -passo : e.key === 'ArrowRight' ? passo : 0
        const dy = e.key === 'ArrowUp' ? -passo : e.key === 'ArrowDown' ? passo : 0
        const ids = selecao
        aplicar((m) => moverElementos(m, ids, dx, dy), `setas:${ids.join()}`)
      }
    }
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => teclado.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ----- arquivo -----
  const novoModelo = (m: Modelo, texto: string) => {
    substituirModelo(m)
    setPaginaId(m.paginas[0].id)
    setSelecao([])
    setAberto(null)
    avisar(texto, { rotulo: 'Desfazer', f: () => despachar({ tipo: 'desfazer' }) })
  }

  const importarModelo = async (arquivo?: File) => {
    if (!arquivo) return
    try {
      const m = normalizarModelo(JSON.parse(await arquivo.text()))
      if (!m) {
        avisar('Esse arquivo não é um modelo de ficha. Procure um .json exportado em Exportar modelo.')
        return
      }
      novoModelo(m, `Modelo ${m.nome} aberto.`)
    } catch {
      avisar('Não deu para ler esse arquivo. Ele precisa ser um JSON válido.')
    }
  }

  const importarPersonagem = async (arquivo?: File) => {
    if (!arquivo) return
    try {
      const p = normalizarPersonagem(JSON.parse(await arquivo.text()))
      if (!p) {
        avisar('Esse arquivo não é um personagem. Procure um .json exportado em Exportar personagem.')
        return
      }
      const anterior = valores
      substituirValores(p.valores)
      const outroModelo = p.modeloId && p.modeloId !== modelo.id
      avisar(
        outroModelo
          ? `Personagem feito para o modelo ${p.modeloNome || p.modeloId}. Os campos com a mesma chave foram preenchidos.`
          : 'Personagem carregado.',
        { rotulo: 'Desfazer', f: () => substituirValores(anterior) },
      )
    } catch {
      avisar('Não deu para ler esse arquivo. Ele precisa ser um JSON válido.')
    }
    setAberto(null)
  }

  const exportarModelo = () => {
    setExportando({
      titulo: 'Exportar modelo',
      nome: `${slug(modelo.nome)}.modelo.json`,
      conteudo: JSON.stringify(modelo, null, 2),
    })
    setAberto(null)
  }

  const exportarPersonagem = () => {
    const p: Personagem = {
      formato: 'ficha-personagem',
      versao: 1,
      modeloId: modelo.id,
      modeloNome: modelo.nome,
      valores,
    }
    const nome = typeof valores.nome === 'string' && valores.nome.trim() ? valores.nome : 'personagem'
    setExportando({
      titulo: 'Exportar personagem',
      nome: `${slug(nome)}.personagem.json`,
      conteudo: JSON.stringify(p, null, 2),
    })
    setAberto(null)
  }

  const fecharExportacao = useCallback(() => setExportando(null), [])

  const limparValores = () => {
    const anterior = valores
    substituirValores({})
    setAberto(null)
    avisar('Valores da ficha apagados.', { rotulo: 'Desfazer', f: () => substituirValores(anterior) })
  }

  // ----- páginas -----
  const novaPagina = () => {
    const { modelo: m, id } = adicionarPagina(modelo, `Página ${modelo.paginas.length + 1}`)
    aplicar(() => m)
    setPaginaId(id)
    setSelecao([])
  }

  const apagarPagina = (id: string) => {
    const idx = modelo.paginas.findIndex((p) => p.id === id)
    const nome = modelo.paginas[idx]?.nome
    aplicar((m) => removerPagina(m, id))
    const vizinha = modelo.paginas[idx - 1] ?? modelo.paginas[idx + 1]
    if (vizinha) setPaginaId(vizinha.id)
    avisar(`Página ${nome} removida.`, { rotulo: 'Desfazer', f: () => despachar({ tipo: 'desfazer' }) })
  }

  const chavesConflitantes = [...usosDeChaves(modelo).entries()].filter(
    ([, els]) => new Set(els.map((e) => e.tipo)).size > 1,
  ).length

  const editar = modo === 'editar'

  return (
    <div className={`app app--${modo}${painel ? ` app--painel-${painel}` : ''}`}>
      <header className="topo">
        {editar && (
          <button
            type="button"
            className="botao-topo so-estreito"
            aria-label="Campos"
            aria-pressed={painel === 'esq'}
            onClick={() => setPainel(painel === 'esq' ? null : 'esq')}
          >
            <Icone nome="campos" />
            <span>Campos</span>
          </button>
        )}
        {editar ? (
          <input
            className="topo__nome"
            value={modelo.nome}
            aria-label="Nome do modelo"
            onChange={(e) => aplicar((m) => ({ ...m, nome: e.target.value }), 'nome-modelo')}
          />
        ) : (
          <span className="topo__nome topo__nome--fixo">{modelo.nome}</span>
        )}

        <div className="modo" role="radiogroup" aria-label="Modo">
          <button type="button" role="radio" aria-checked={editar} onClick={() => setModo('editar')}>
            Editar<span className="longo"> modelo</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!editar}
            onClick={() => {
              setModo('usar')
              setPainel(null)
            }}
          >
            Preencher<span className="longo"> ficha</span>
          </button>
        </div>

        {editar && (
          <div className="grupo-botoes">
            <button
              type="button"
              className="botao-icone"
              title="Desfazer (Ctrl+Z)"
              aria-label="Desfazer"
              disabled={!hist.passado.length}
              onClick={() => despachar({ tipo: 'desfazer' })}
            >
              <Icone nome="desfazer" />
            </button>
            <button
              type="button"
              className="botao-icone"
              title="Refazer (Ctrl+Y)"
              aria-label="Refazer"
              disabled={!hist.futuro.length}
              onClick={() => despachar({ tipo: 'refazer' })}
            >
              <Icone nome="refazer" />
            </button>
          </div>
        )}

        <div className="espaco" />

        <div className="zoom">
          <button type="button" className="botao-icone" aria-label="Diminuir zoom" onClick={() => passoZoom(-1)}>
            <Icone nome="menos" />
          </button>
          <button
            type="button"
            className="zoom__valor"
            title="Ajustar à largura"
            aria-label={`Zoom ${Math.round(zoom * 100)}%. Clique para ajustar à largura`}
            onClick={() => setZoomAuto(true)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="botao-icone" aria-label="Aumentar zoom" onClick={() => passoZoom(1)}>
            <Icone nome="mais" />
          </button>
        </div>

        <div className="menu">
          <button
            type="button"
            className="botao-icone"
            title="Aparência"
            aria-label="Aparência"
            aria-haspopup="dialog"
            aria-expanded={aberto === 'aparencia'}
            onClick={() => setAberto(aberto === 'aparencia' ? null : 'aparencia')}
          >
            <Icone nome={aparencia.escuro ? 'lua' : 'sol'} />
          </button>
          {aberto === 'aparencia' && (
            <>
              <div className="menu__fundo" onClick={() => setAberto(null)} />
              <div className="menu__lista menu__lista--aparencia" role="dialog" aria-label="Aparência">
                <p className="menu__grupo">Tema</p>
                <Segmentos<Tema>
                  rotulo="Tema"
                  valor={aparencia.tema}
                  opcoes={[
                    { v: 'sistema', r: 'Sistema' },
                    { v: 'claro', r: 'Claro' },
                    { v: 'escuro', r: 'Escuro' },
                  ]}
                  aoMudar={(tema) => aparencia.mudar({ tema })}
                />
                <Alternar
                  rotulo="Manter a folha clara no modo escuro"
                  marcado={aparencia.folhaClara}
                  aoMudar={(folhaClara) => aparencia.mudar({ folhaClara })}
                />
              </div>
            </>
          )}
        </div>

        <div className="menu">
          <button
            type="button"
            className="botao-topo"
            aria-label="Arquivo"
            aria-expanded={aberto === 'arquivo'}
            aria-haspopup="menu"
            onClick={() => setAberto(aberto === 'arquivo' ? null : 'arquivo')}
          >
            <Icone nome="menu" />
            <span>Arquivo</span>
          </button>
          {aberto === 'arquivo' && (
            <>
              <div className="menu__fundo" onClick={() => setAberto(null)} />
              <div className="menu__lista" role="menu">
                <p className="menu__grupo">Modelo</p>
                <button type="button" role="menuitem" onClick={() => novoModelo(modeloEmBranco(), 'Modelo em branco criado.')}>
                  Novo modelo em branco
                </button>
                <button type="button" role="menuitem" onClick={() => novoModelo(modeloExemplo(), 'Exemplo d20 aberto.')}>
                  Abrir o exemplo d20
                </button>
                <button type="button" role="menuitem" onClick={() => entradaModelo.current?.click()}>
                  Importar modelo
                </button>
                <button type="button" role="menuitem" onClick={exportarModelo}>
                  Exportar modelo
                </button>
                <p className="menu__grupo">Personagem</p>
                <button type="button" role="menuitem" onClick={() => entradaPersonagem.current?.click()}>
                  Importar personagem
                </button>
                <button type="button" role="menuitem" onClick={exportarPersonagem}>
                  Exportar personagem
                </button>
                <button type="button" role="menuitem" className="perigo" onClick={limparValores}>
                  Apagar valores da ficha
                </button>
              </div>
            </>
          )}
          <input
            ref={entradaModelo}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void importarModelo(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            ref={entradaPersonagem}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void importarPersonagem(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>

        {editar && (
          <button
            type="button"
            className="botao-topo so-estreito"
            aria-label="Propriedades"
            aria-pressed={painel === 'dir'}
            onClick={() => setPainel(painel === 'dir' ? null : 'dir')}
          >
            <Icone nome="ajustes" />
            <span>Propriedades</span>
          </button>
        )}
      </header>

      <div className="corpo">
        {editar && (
          <aside className="painel painel--esq" aria-label="Campos">
            <Paleta
              pagina={pagina}
              selecao={selecao}
              adicionar={(t) => adicionarTipo(t)}
              selecionar={(id, somar) =>
                setSelecao(
                  somar ? (selecao.includes(id) ? selecao.filter((x) => x !== id) : [...selecao, id]) : [id],
                )
              }
            />
          </aside>
        )}

        <main className="mesa">
          <div className="mesa__rolagem" ref={rolagemRef}>
            <Folha
              modelo={modelo}
              pagina={pagina}
              modo={modo}
              zoom={zoom}
              valores={valores}
              definirValor={definirValor}
              avisar={avisar}
              selecao={selecao}
              setSelecao={setSelecao}
              aplicar={aplicar}
              mostrarGrade={mostrarGrade}
              aoSoltarTipo={adicionarTipo}
              folhaRef={folhaRef}
              cores={cores}
            />
          </div>

          <nav className="abas" aria-label="Páginas da ficha">
            {modelo.paginas.map((p) => (
              <div key={p.id} className={`aba${p.id === pagina.id ? ' aba--ativa' : ''}`}>
                {renomeando === p.id ? (
                  <input
                    className="aba__entrada"
                    autoFocus
                    defaultValue={p.nome}
                    aria-label="Nome da página"
                    onBlur={(e) => {
                      const nome = e.target.value.trim()
                      if (nome && nome !== p.nome) aplicar((m) => renomearPagina(m, p.id, nome))
                      setRenomeando(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setRenomeando(null)
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="aba__botao"
                    aria-current={p.id === pagina.id ? 'page' : undefined}
                    title={editar ? 'Clique duas vezes para renomear' : undefined}
                    onClick={() => {
                      setPaginaId(p.id)
                      setSelecao([])
                    }}
                    onDoubleClick={() => editar && setRenomeando(p.id)}
                  >
                    {p.nome}
                  </button>
                )}
                {editar && p.id === pagina.id && modelo.paginas.length > 1 && renomeando !== p.id && (
                  <button
                    type="button"
                    className="aba__fechar"
                    aria-label={`Remover página ${p.nome}`}
                    title="Remover página"
                    onClick={() => apagarPagina(p.id)}
                  >
                    <Icone nome="fechar" tamanho={12} />
                  </button>
                )}
              </div>
            ))}
            {editar && (
              <button type="button" className="aba aba--nova" onClick={novaPagina}>
                <Icone nome="mais" tamanho={14} />
                <span>Página</span>
              </button>
            )}
            {editar && chavesConflitantes > 0 && (
              <span className="abas__alerta">
                {chavesConflitantes === 1
                  ? '1 chave usada em campos de tipos diferentes'
                  : `${chavesConflitantes} chaves usadas em campos de tipos diferentes`}
              </span>
            )}
          </nav>
        </main>

        {editar && (
          <aside className="painel painel--dir" aria-label="Propriedades">
            <Inspetor
              modelo={modelo}
              pagina={pagina}
              selecionados={selecionados}
              aplicar={aplicar}
              alterar={alterar}
              renomearRotulo={renomearRotulo}
              mudarChave={mudarChave}
              excluir={excluir}
              duplicar={duplicar}
              reordenar={(d) => aplicar((m) => reordenar(m, pagina.id, selecao, d))}
              alinhar={(md) => aplicar((m) => alinhar(m, selecao, md))}
              distribuir={(eixo) => aplicar((m) => distribuir(m, selecao, eixo))}
              igualar={(eixo) => aplicar((m) => igualarTamanho(m, selecao, selecao[0], eixo))}
              mostrarGrade={mostrarGrade}
              setMostrarGrade={setMostrarGrade}
              folhaInvertida={cores.invertida}
            />
          </aside>
        )}
        {painel && <div className="painel-fundo so-estreito" onClick={() => setPainel(null)} />}
      </div>

      {exportando && (
        <DialogoExportar
          titulo={exportando.titulo}
          nomeArquivo={exportando.nome}
          conteudo={exportando.conteudo}
          fechar={fecharExportacao}
        />
      )}

      {aviso && (
        <div className="aviso" role="status">
          <span>{aviso.texto}</span>
          {aviso.acao && (
            <button
              type="button"
              onClick={() => {
                aviso.acao?.f()
                setAviso(null)
              }}
            >
              {aviso.acao.rotulo}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
