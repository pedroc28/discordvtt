// Painel da direita: propriedades do campo selecionado, de vários campos
// ou, sem seleção, da folha e do modelo.

import { useState, type ReactNode } from 'react'
import { DEF } from './campos'
import { Icone, IconeCampo, type NomeIcone } from './Icones'
import type { ModoAlinhar } from './operacoes'
import type {
  Alinhamento,
  Borda,
  ColunaTabela,
  ConfigCampo,
  Elemento,
  Estilo,
  Fonte,
  FormaMarcador,
  Modelo,
  Pagina,
  PosicaoRotulo,
  TipoColuna,
} from './tipos'
import { chaveValida, usosDeChaves } from './util'

// ---------- controles básicos ----------

function Linha({ rotulo, children, largo }: { rotulo: string; children: ReactNode; largo?: boolean }) {
  return (
    <label className={`insp__linha${largo ? ' insp__linha--largo' : ''}`}>
      <span className="insp__rotulo">{rotulo}</span>
      {children}
    </label>
  )
}

function NumeroInsp({
  valor,
  aoMudar,
  min,
  max,
  passo = 1,
  vazio,
}: {
  valor: number | null | undefined
  aoMudar: (n: number | null) => void
  min?: number
  max?: number
  passo?: number
  /** Permite deixar em branco (vira null). */
  vazio?: boolean
}) {
  const [rascunho, setRascunho] = useState<string | null>(null)
  const texto = rascunho ?? (valor == null ? '' : String(Math.round(valor * 100) / 100))
  const aplicar = (t: string) => {
    const limpo = t.trim().replace(',', '.')
    if (limpo === '') {
      if (vazio) aoMudar(null)
      return
    }
    const n = Number(limpo)
    if (!Number.isFinite(n)) return
    aoMudar(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)))
  }
  return (
    <input
      className="insp__entrada insp__entrada--num"
      type="text"
      inputMode="decimal"
      value={texto}
      onChange={(e) => {
        setRascunho(e.target.value)
        aplicar(e.target.value)
      }}
      onBlur={() => setRascunho(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          const delta = (e.key === 'ArrowUp' ? 1 : -1) * passo * (e.shiftKey ? 10 : 1)
          setRascunho(null)
          aplicar(String((valor ?? 0) + delta))
        }
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

function TextoInsp({ valor, aoMudar, dica }: { valor: string; aoMudar: (t: string) => void; dica?: string }) {
  return (
    <input
      className="insp__entrada"
      type="text"
      value={valor}
      placeholder={dica}
      onChange={(e) => aoMudar(e.target.value)}
    />
  )
}

function Seletor<T extends string | number>({
  valor,
  opcoes,
  aoMudar,
}: {
  valor: T
  opcoes: [T, string][]
  aoMudar: (v: T) => void
}) {
  return (
    <select
      className="insp__entrada"
      value={String(valor)}
      onChange={(e) => {
        const achado = opcoes.find(([v]) => String(v) === e.target.value)
        if (achado) aoMudar(achado[0])
      }}
    >
      {opcoes.map(([v, r]) => (
        <option key={String(v)} value={String(v)}>
          {r}
        </option>
      ))}
    </select>
  )
}

export function Segmentos<T extends string>({
  valor,
  opcoes,
  aoMudar,
  rotulo,
}: {
  valor: T
  opcoes: { v: T; r: string; icone?: NomeIcone }[]
  aoMudar: (v: T) => void
  rotulo: string
}) {
  return (
    <div className="segmentos" role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={valor === o.v}
          title={o.r}
          className={valor === o.v ? 'ativo' : undefined}
          onClick={() => aoMudar(o.v)}
        >
          {o.icone ? <Icone nome={o.icone} /> : o.r}
        </button>
      ))}
    </div>
  )
}

export function Alternar({ marcado, aoMudar, rotulo }: { marcado: boolean; aoMudar: (v: boolean) => void; rotulo: string }) {
  return (
    <label className="alternar">
      <input type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} />
      <span className="alternar__trilho" aria-hidden="true" />
      <span>{rotulo}</span>
    </label>
  )
}

function Cor({ valor, aoMudar, rotulo }: { valor: string; aoMudar: (v: string) => void; rotulo: string }) {
  return (
    <label className="cor">
      <input type="color" value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label={rotulo} />
      <span>{rotulo}</span>
    </label>
  )
}

/** Rótulo em cima e controle ocupando a largura toda. */
function Bloco({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="insp__bloco">
      <span className="insp__rotulo">{rotulo}</span>
      {children}
    </div>
  )
}

/** Liga uma cor própria ou volta para a cor de destaque do modelo (null). */
function CorOpcional({
  rotulo,
  valor,
  padrao,
  aoMudar,
}: {
  rotulo: string
  valor: string | null | undefined
  padrao: string
  aoMudar: (v: string | null) => void
}) {
  return (
    <div className="insp__cor-opcional">
      <Alternar rotulo={rotulo} marcado={!!valor} aoMudar={(v) => aoMudar(v ? padrao : null)} />
      {valor && (
        <label className="cor">
          <input type="color" value={valor} aria-label="Escolher a cor" onChange={(e) => aoMudar(e.target.value)} />
        </label>
      )}
    </div>
  )
}

function BotaoIcone({
  icone,
  rotulo,
  onClick,
  perigo,
  desabilitado,
}: {
  icone: NomeIcone
  rotulo: string
  onClick: () => void
  perigo?: boolean
  desabilitado?: boolean
}) {
  return (
    <button
      type="button"
      className={`botao-icone${perigo ? ' botao-icone--perigo' : ''}`}
      title={rotulo}
      aria-label={rotulo}
      onClick={onClick}
      disabled={desabilitado}
    >
      <Icone nome={icone} />
    </button>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="painel__secao">
      <h2 className="painel__titulo">{titulo}</h2>
      {children}
    </section>
  )
}

// ---------- opções compartilhadas ----------

const POSICOES: [PosicaoRotulo, string][] = [
  ['acima', 'Acima'],
  ['abaixo', 'Abaixo'],
  ['esquerda', 'À esquerda'],
  ['direita', 'À direita'],
  ['oculto', 'Escondido'],
]
const ALINHAMENTOS: { v: Alinhamento; r: string; icone: NomeIcone }[] = [
  { v: 'esquerda', r: 'Alinhar à esquerda', icone: 'alinharEsquerda' },
  { v: 'centro', r: 'Centralizar', icone: 'alinharCentroH' },
  { v: 'direita', r: 'Alinhar à direita', icone: 'alinharDireita' },
]
const FORMAS: { v: FormaMarcador; r: string }[] = [
  { v: 'quadrado', r: 'Quadrado' },
  { v: 'circulo', r: 'Círculo' },
  { v: 'losango', r: 'Losango' },
]

// ---------- inspetor ----------

export interface PropsInspetor {
  modelo: Modelo
  pagina: Pagina
  selecionados: Elemento[]
  aplicar: (f: (m: Modelo) => Modelo, grupo?: string) => void
  alterar: (ids: string[], f: (e: Elemento) => Elemento, grupo?: string) => void
  renomearRotulo: (el: Elemento, rotulo: string) => void
  mudarChave: (el: Elemento, chave: string) => void
  excluir: () => void
  duplicar: () => void
  reordenar: (destino: 'frente' | 'tras') => void
  alinhar: (modo: ModoAlinhar) => void
  distribuir: (eixo: 'h' | 'v') => void
  igualar: (eixo: 'w' | 'h') => void
  mostrarGrade: boolean
  setMostrarGrade: (v: boolean) => void
  /** A folha está aparecendo com as cores invertidas do modo escuro. */
  folhaInvertida: boolean
}

export function Inspetor(p: PropsInspetor) {
  if (p.selecionados.length === 0) return <InspetorFolha {...p} />
  if (p.selecionados.length > 1) return <InspetorVarios {...p} />
  return <InspetorElemento {...p} el={p.selecionados[0]} />
}

function ControlesEstilo({
  els,
  alterar,
}: {
  els: Elemento[]
  alterar: (ids: string[], f: (e: Elemento) => Elemento, grupo?: string) => void
}) {
  const ids = els.map((e) => e.id)
  const e0 = els[0]
  const ehMoldura = els.every((e) => e.tipo === 'moldura')
  const ehTitulo = els.every((e) => e.tipo === 'titulo')
  const mudarEstilo = (patch: Partial<Estilo>, grupo?: string) =>
    alterar(ids, (e) => ({ ...e, estilo: { ...e.estilo, ...patch } }), grupo)

  const bordas: { v: Borda; r: string }[] = ehMoldura
    ? [
        { v: 'caixa', r: 'Caixa' },
        { v: 'linha', r: 'Só em cima' },
        { v: 'nenhuma', r: 'Sem borda' },
      ]
    : [
        { v: 'caixa', r: 'Caixa' },
        { v: 'linha', r: 'Linha' },
        { v: 'nenhuma', r: 'Nenhuma' },
      ]

  return (
    <Secao titulo="Aparência">
      <div className="insp__dupla">
        {!ehMoldura && (
          <Linha rotulo="Texto">
            <NumeroInsp
              valor={e0.estilo.tamanhoFonte}
              min={6}
              max={200}
              aoMudar={(n) => n != null && mudarEstilo({ tamanhoFonte: n }, `fonte:${ids}`)}
            />
          </Linha>
        )}
        {!ehTitulo && (
          <Linha rotulo={ehMoldura ? 'Título' : 'Rótulo'}>
            <NumeroInsp
              valor={e0.estilo.tamanhoRotulo}
              min={6}
              max={120}
              aoMudar={(n) => n != null && mudarEstilo({ tamanhoRotulo: n }, `rotulo:${ids}`)}
            />
          </Linha>
        )}
      </div>
      {!ehTitulo &&
        (ehMoldura ? (
          <Alternar
            rotulo="Mostrar título na borda"
            marcado={e0.estilo.rotulo !== 'oculto'}
            aoMudar={(v) => mudarEstilo({ rotulo: v ? 'acima' : 'oculto' })}
          />
        ) : (
          <Linha rotulo="Posição do rótulo">
            <Seletor valor={e0.estilo.rotulo} opcoes={POSICOES} aoMudar={(v) => mudarEstilo({ rotulo: v })} />
          </Linha>
        ))}
      {!ehTitulo && (
        <Linha rotulo="Borda">
          <Segmentos rotulo="Borda" valor={e0.estilo.borda} opcoes={bordas} aoMudar={(v) => mudarEstilo({ borda: v })} />
        </Linha>
      )}
      <div className="insp__dupla insp__dupla--centro">
        <Segmentos
          rotulo="Alinhamento"
          valor={e0.estilo.alinhamento}
          opcoes={ALINHAMENTOS}
          aoMudar={(v) => mudarEstilo({ alinhamento: v })}
        />
        <Alternar rotulo="Negrito" marcado={e0.estilo.negrito} aoMudar={(v) => mudarEstilo({ negrito: v })} />
      </div>
    </Secao>
  )
}

function InspetorElemento(p: PropsInspetor & { el: Elemento }) {
  const { el, modelo } = p
  const def = DEF[el.tipo]
  const ids = [el.id]
  const mudarConfig = (patch: Partial<ConfigCampo>, grupo?: string) =>
    p.alterar(ids, (e) => ({ ...e, config: { ...e.config, ...patch } }), grupo)
  const mudarGeo = (k: 'x' | 'y' | 'w' | 'h', n: number | null) => {
    if (n == null) return
    p.alterar(
      ids,
      (e) => {
        const v = Math.round(n)
        if (k === 'x') return { ...e, x: Math.max(0, Math.min(modelo.largura - e.w, v)) }
        if (k === 'y') return { ...e, y: Math.max(0, Math.min(modelo.altura - e.h, v)) }
        if (k === 'w') return { ...e, w: Math.max(8, Math.min(modelo.largura - e.x, v)) }
        return { ...e, h: Math.max(8, Math.min(modelo.altura - e.y, v)) }
      },
      `geo:${k}:${el.id}`,
    )
  }

  return (
    <div className="inspetor">
      <div className="insp__cabeca">
        <IconeCampo tipo={el.tipo} tamanho={18} />
        <strong>{def.nome}</strong>
        <div className="insp__acoes">
          <BotaoIcone icone="duplicar" rotulo="Duplicar (Ctrl+D)" onClick={p.duplicar} />
          <BotaoIcone icone="frente" rotulo="Trazer para a frente" onClick={() => p.reordenar('frente')} />
          <BotaoIcone icone="tras" rotulo="Enviar para trás" onClick={() => p.reordenar('tras')} />
          <BotaoIcone icone="lixeira" rotulo="Excluir (Delete)" onClick={p.excluir} perigo />
        </div>
      </div>

      <Secao titulo="Conteúdo">
        {el.tipo === 'titulo' ? (
          <Linha rotulo="Texto" largo>
            <textarea
              className="insp__entrada insp__area"
              rows={3}
              value={el.config.texto ?? ''}
              onChange={(e) => mudarConfig({ texto: e.target.value }, `texto:${el.id}`)}
            />
          </Linha>
        ) : (
          <Linha rotulo={el.tipo === 'moldura' ? 'Título' : 'Rótulo'} largo>
            <TextoInsp valor={el.rotulo} aoMudar={(t) => p.renomearRotulo(el, t)} />
          </Linha>
        )}
        {def.temChave && <EditorChave key={`${el.id}:${el.chave}`} el={el} modelo={modelo} mudarChave={p.mudarChave} />}
      </Secao>

      <OpcoesDoTipo el={el} mudarConfig={mudarConfig} destaque={modelo.corDestaque} />

      <Secao titulo="Posição e tamanho">
        <div className="insp__quadro">
          <Linha rotulo="X">
            <NumeroInsp valor={el.x} aoMudar={(n) => mudarGeo('x', n)} passo={modelo.grade || 1} />
          </Linha>
          <Linha rotulo="Y">
            <NumeroInsp valor={el.y} aoMudar={(n) => mudarGeo('y', n)} passo={modelo.grade || 1} />
          </Linha>
          <Linha rotulo="Largura">
            <NumeroInsp valor={el.w} aoMudar={(n) => mudarGeo('w', n)} passo={modelo.grade || 1} />
          </Linha>
          <Linha rotulo="Altura">
            <NumeroInsp valor={el.h} aoMudar={(n) => mudarGeo('h', n)} passo={modelo.grade || 1} />
          </Linha>
        </div>
      </Secao>

      <ControlesEstilo els={[el]} alterar={p.alterar} />
    </div>
  )
}

function EditorChave({
  el,
  modelo,
  mudarChave,
}: {
  el: Elemento
  modelo: Modelo
  mudarChave: (el: Elemento, chave: string) => void
}) {
  const [rascunho, setRascunho] = useState(el.chave)
  const valida = chaveValida(rascunho)
  const outros = usosDeChaves(modelo, el.id).get(el.chave) ?? []
  const conflito = outros.find((o) => o.tipo !== el.tipo)
  const confirmar = () => {
    if (valida && rascunho !== el.chave) mudarChave(el, rascunho)
    else if (!valida) setRascunho(el.chave)
  }
  return (
    <>
      <Linha rotulo="Chave" largo>
        <input
          className={`insp__entrada insp__entrada--chave${valida ? '' : ' invalida'}`}
          type="text"
          spellCheck={false}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setRascunho(el.chave)
              e.currentTarget.blur()
            }
          }}
        />
      </Linha>
      {!valida ? (
        <p className="insp__nota insp__nota--erro">
          Use letras minúsculas sem acento, números e _. Comece com uma letra.
        </p>
      ) : conflito ? (
        <p className="insp__nota insp__nota--erro">
          A chave {el.chave} também está num campo do tipo {DEF[conflito.tipo].nome}. Os dois vão disputar o
          mesmo valor. Troque uma das chaves.
        </p>
      ) : outros.length > 0 ? (
        <p className="insp__nota">
          Outros {outros.length} {outros.length === 1 ? 'campo usa' : 'campos usam'} esta chave e mostram o mesmo
          valor.
        </p>
      ) : (
        <p className="insp__nota">É o nome do dado nas fórmulas, como @{el.chave}.</p>
      )}
    </>
  )
}

function EditorOpcoes({ el, mudar }: { el: Elemento; mudar: (opcoes: string[]) => void }) {
  const [texto, setTexto] = useState((el.config.opcoes ?? []).join('\n'))
  return (
    <Linha rotulo="Opções, uma por linha" largo>
      <textarea
        className="insp__entrada insp__area"
        rows={5}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          mudar(
            e.target.value
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }}
      />
    </Linha>
  )
}

function EditorColunas({ colunas, mudar }: { colunas: ColunaTabela[]; mudar: (c: ColunaTabela[]) => void }) {
  const alterarColuna = (i: number, patch: Partial<ColunaTabela>) =>
    mudar(colunas.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const adicionar = () => {
    const usados = new Set(colunas.map((c) => c.id))
    let id = 'coluna'
    let n = 2
    while (usados.has(id)) id = `coluna_${n++}`
    mudar([...colunas, { id, rotulo: 'Coluna', tipo: 'texto', largura: 1 }])
  }
  const tipos: [TipoColuna, string][] = [
    ['texto', 'Texto'],
    ['numero', 'Número'],
    ['checkbox', 'Marcar'],
  ]
  return (
    <div className="colunas">
      <div className="colunas__cab">
        <span>Coluna</span>
        <span>Tipo</span>
        <span>Largura</span>
        <span />
      </div>
      {colunas.map((c, i) => (
        <div className="colunas__linha" key={c.id}>
          <input
            className="insp__entrada"
            type="text"
            value={c.rotulo}
            aria-label="Nome da coluna"
            onChange={(e) => alterarColuna(i, { rotulo: e.target.value })}
          />
          <Seletor valor={c.tipo} opcoes={tipos} aoMudar={(v) => alterarColuna(i, { tipo: v })} />
          <NumeroInsp valor={c.largura} min={0.5} max={20} passo={0.5} aoMudar={(n) => n != null && alterarColuna(i, { largura: n })} />
          <BotaoIcone
            icone="fechar"
            rotulo={`Remover coluna ${c.rotulo}`}
            onClick={() => mudar(colunas.filter((_, j) => j !== i))}
            desabilitado={colunas.length <= 1}
          />
        </div>
      ))}
      <button type="button" className="botao-texto" onClick={adicionar}>
        + Adicionar coluna
      </button>
    </div>
  )
}

function OpcoesDoTipo({
  el,
  mudarConfig,
  destaque,
}: {
  el: Elemento
  mudarConfig: (patch: Partial<ConfigCampo>, grupo?: string) => void
  /** Cor de destaque do modelo, usada como ponto de partida das cores próprias. */
  destaque: string
}) {
  const c = el.config
  const g = (k: string) => `cfg:${k}:${el.id}`
  switch (el.tipo) {
    case 'texto':
    case 'textoLongo':
      return (
        <Secao titulo="Opções">
          <Linha rotulo="Texto de exemplo" largo>
            <TextoInsp valor={c.dica ?? ''} dica="Aparece apagado quando vazio" aoMudar={(t) => mudarConfig({ dica: t }, g('dica'))} />
          </Linha>
          {el.tipo === 'textoLongo' && (
            <Alternar rotulo="Linhas de caderno" marcado={!!c.pautado} aoMudar={(v) => mudarConfig({ pautado: v })} />
          )}
        </Secao>
      )
    case 'numero':
      return (
        <Secao titulo="Opções">
          <div className="insp__quadro insp__quadro--3">
            <Linha rotulo="Mínimo">
              <NumeroInsp valor={c.min} vazio aoMudar={(n) => mudarConfig({ min: n }, g('min'))} />
            </Linha>
            <Linha rotulo="Máximo">
              <NumeroInsp valor={c.max} vazio aoMudar={(n) => mudarConfig({ max: n }, g('max'))} />
            </Linha>
            <Linha rotulo="Passo">
              <NumeroInsp valor={c.passo ?? 1} min={0.01} aoMudar={(n) => n != null && mudarConfig({ passo: n }, g('passo'))} />
            </Linha>
          </div>
          <p className="insp__nota">As setas do teclado somam ou subtraem o passo.</p>
        </Secao>
      )
    case 'recurso': {
      const barra = c.estiloRecurso === 'barra'
      return (
        <Secao titulo="Opções">
          <Bloco rotulo="Estilo">
            <Segmentos
              rotulo="Estilo"
              valor={c.estiloRecurso ?? 'numeros'}
              opcoes={[
                { v: 'numeros', r: 'Números' },
                { v: 'barra', r: 'Barra de vida' },
              ]}
              aoMudar={(v) => mudarConfig({ estiloRecurso: v })}
            />
          </Bloco>
          {barra ? (
            <>
              <Alternar
                rotulo="Mostrar divisões entre as partes"
                marcado={c.divisoes !== false}
                aoMudar={(v) => mudarConfig({ divisoes: v })}
              />
              <Alternar
                rotulo="Mostrar atual/máximo"
                marcado={c.mostrarNumeros !== false}
                aoMudar={(v) => mudarConfig({ mostrarNumeros: v })}
              />
              <CorOpcional
                rotulo="Cor própria da barra"
                valor={c.cor}
                padrao={destaque}
                aoMudar={(v) => mudarConfig({ cor: v }, g('cor'))}
              />
            </>
          ) : (
            <>
              <Alternar rotulo="Barra de progresso" marcado={!!c.barra} aoMudar={(v) => mudarConfig({ barra: v })} />
              <Alternar rotulo="Botões − e +" marcado={!!c.botoes} aoMudar={(v) => mudarConfig({ botoes: v })} />
            </>
          )}
          <Linha rotulo="Máximo padrão">
            <NumeroInsp valor={c.maxPadrao} vazio min={0} aoMudar={(n) => mudarConfig({ maxPadrao: n }, g('maxp'))} />
          </Linha>
          <p className="insp__nota">
            {barra
              ? 'A barra é dividida em tantas partes quanto o máximo. Na ficha, clique ou arraste sobre ela para mudar o atual. O máximo padrão vale enquanto o personagem não preencher o dele.'
              : 'O máximo padrão vale enquanto o personagem não preencher o dele.'}
          </p>
        </Secao>
      )
    }
    case 'relogio': {
      const aw = (c.formatoRelogio ?? 'apocalypse') === 'apocalypse'
      return (
        <Secao titulo="Opções">
          <Bloco rotulo="Formato">
            <Segmentos
              rotulo="Formato"
              valor={c.formatoRelogio ?? 'apocalypse'}
              opcoes={[
                { v: 'apocalypse', r: 'Apocalypse World' },
                { v: 'iguais', r: 'Partes iguais' },
              ]}
              aoMudar={(v) => mudarConfig({ formatoRelogio: v })}
            />
          </Bloco>
          {aw ? (
            <Alternar
              rotulo="Mostrar as horas"
              marcado={c.mostrarHoras !== false}
              aoMudar={(v) => mudarConfig({ mostrarHoras: v })}
            />
          ) : (
            <Linha rotulo="Partes">
              <NumeroInsp
                valor={c.quantidade ?? 4}
                min={2}
                max={24}
                aoMudar={(n) => n != null && mudarConfig({ quantidade: Math.round(n) }, g('qtd'))}
              />
            </Linha>
          )}
          <CorOpcional
            rotulo="Cor própria das partes marcadas"
            valor={c.cor}
            padrao={destaque}
            aoMudar={(v) => mudarConfig({ cor: v }, g('cor'))}
          />
          <p className="insp__nota">
            {aw
              ? 'Três partes grandes até 9:00 e três pequenas até 12:00. Na ficha, clique numa parte para marcar até ela.'
              : 'Na ficha, clique numa parte para marcar até ela.'}
          </p>
        </Secao>
      )
    }
    case 'checkbox':
      return (
        <Secao titulo="Opções">
          <Linha rotulo="Forma">
            <Segmentos rotulo="Forma" valor={c.forma ?? 'quadrado'} opcoes={FORMAS} aoMudar={(v) => mudarConfig({ forma: v })} />
          </Linha>
        </Secao>
      )
    case 'marcadores':
      return (
        <Secao titulo="Opções">
          <Linha rotulo="Quantidade">
            <NumeroInsp valor={c.quantidade ?? 3} min={1} max={30} aoMudar={(n) => n != null && mudarConfig({ quantidade: Math.round(n) }, g('qtd'))} />
          </Linha>
          <Linha rotulo="Forma">
            <Segmentos rotulo="Forma" valor={c.forma ?? 'circulo'} opcoes={FORMAS} aoMudar={(v) => mudarConfig({ forma: v })} />
          </Linha>
          <Alternar rotulo="Marcar em sequência" marcado={!!c.sequencial} aoMudar={(v) => mudarConfig({ sequencial: v })} />
          <p className="insp__nota">Em sequência, clicar no terceiro marca os três primeiros.</p>
        </Secao>
      )
    case 'lista':
      return (
        <Secao titulo="Opções">
          <EditorOpcoes key={el.id} el={el} mudar={(o) => mudarConfig({ opcoes: o }, g('opcoes'))} />
        </Secao>
      )
    case 'tabela':
      return (
        <Secao titulo="Colunas">
          <EditorColunas colunas={c.colunas ?? []} mudar={(cols) => mudarConfig({ colunas: cols }, g('colunas'))} />
          <p className="insp__nota">Renomear uma coluna não apaga o que já foi escrito nela.</p>
        </Secao>
      )
    case 'imagem':
      return (
        <Secao titulo="Opções">
          <Linha rotulo="Encaixe">
            <Segmentos
              rotulo="Encaixe"
              valor={c.ajuste ?? 'cobrir'}
              opcoes={[
                { v: 'cobrir', r: 'Preencher' },
                { v: 'conter', r: 'Inteira' },
              ]}
              aoMudar={(v) => mudarConfig({ ajuste: v })}
            />
          </Linha>
        </Secao>
      )
    case 'moldura':
      return (
        <Secao titulo="Opções">
          <div className="insp__dupla">
            <Linha rotulo="Espessura">
              <NumeroInsp valor={c.espessura ?? 1.5} min={0.5} max={12} passo={0.5} aoMudar={(n) => n != null && mudarConfig({ espessura: n }, g('esp'))} />
            </Linha>
            <Linha rotulo="Cantos">
              <NumeroInsp valor={c.raio ?? 6} min={0} max={80} aoMudar={(n) => n != null && mudarConfig({ raio: n }, g('raio'))} />
            </Linha>
          </div>
          <div className="insp__dupla insp__dupla--centro">
            <Alternar
              rotulo="Cor de fundo"
              marcado={!!c.preenchimento}
              aoMudar={(v) => mudarConfig({ preenchimento: v ? '#efe9dd' : null })}
            />
            {c.preenchimento && (
              <Cor rotulo="Cor" valor={c.preenchimento} aoMudar={(v) => mudarConfig({ preenchimento: v }, g('fundo'))} />
            )}
          </div>
        </Secao>
      )
    default:
      return null
  }
}

function InspetorVarios(p: PropsInspetor) {
  const n = p.selecionados.length
  const alinhar: { m: ModoAlinhar; r: string; icone: NomeIcone }[] = [
    { m: 'esquerda', r: 'Alinhar à esquerda', icone: 'alinharEsquerda' },
    { m: 'centroH', r: 'Centralizar na horizontal', icone: 'alinharCentroH' },
    { m: 'direita', r: 'Alinhar à direita', icone: 'alinharDireita' },
    { m: 'topo', r: 'Alinhar no topo', icone: 'alinharTopo' },
    { m: 'centroV', r: 'Centralizar na vertical', icone: 'alinharCentroV' },
    { m: 'base', r: 'Alinhar na base', icone: 'alinharBase' },
  ]
  const tiposIguais = p.selecionados.every((e) => e.tipo === p.selecionados[0].tipo)
  return (
    <div className="inspetor">
      <div className="insp__cabeca">
        <strong>{n} campos selecionados</strong>
        <div className="insp__acoes">
          <BotaoIcone icone="duplicar" rotulo="Duplicar (Ctrl+D)" onClick={p.duplicar} />
          <BotaoIcone icone="frente" rotulo="Trazer para a frente" onClick={() => p.reordenar('frente')} />
          <BotaoIcone icone="tras" rotulo="Enviar para trás" onClick={() => p.reordenar('tras')} />
          <BotaoIcone icone="lixeira" rotulo="Excluir (Delete)" onClick={p.excluir} perigo />
        </div>
      </div>
      <Secao titulo="Alinhar">
        <div className="barra-icones">
          {alinhar.map((a) => (
            <BotaoIcone key={a.m} icone={a.icone} rotulo={a.r} onClick={() => p.alinhar(a.m)} />
          ))}
        </div>
        <div className="barra-icones">
          <BotaoIcone icone="distribuirH" rotulo="Distribuir na horizontal" onClick={() => p.distribuir('h')} desabilitado={n < 3} />
          <BotaoIcone icone="distribuirV" rotulo="Distribuir na vertical" onClick={() => p.distribuir('v')} desabilitado={n < 3} />
          <BotaoIcone icone="larguraIgual" rotulo="Mesma largura do primeiro" onClick={() => p.igualar('w')} />
          <BotaoIcone icone="alturaIgual" rotulo="Mesma altura do primeiro" onClick={() => p.igualar('h')} />
        </div>
        <p className="insp__nota">Distribuir deixa o mesmo espaço entre três ou mais campos.</p>
      </Secao>
      {tiposIguais || p.selecionados.every((e) => e.tipo !== 'moldura' && e.tipo !== 'titulo') ? (
        <ControlesEstilo els={p.selecionados} alterar={p.alterar} />
      ) : null}
    </div>
  )
}

const TAMANHOS: [string, string, number, number][] = [
  ['a4', 'A4 em pé', 800, 1120],
  ['a4d', 'A4 deitada', 1120, 800],
  ['carta', 'Carta', 816, 1056],
  ['tela', 'Tela larga', 1280, 720],
  ['celular', 'Celular', 400, 860],
]

function InspetorFolha(p: PropsInspetor) {
  const { modelo, pagina } = p
  const mudar = (patch: Partial<Modelo>, grupo?: string) => p.aplicar((m) => ({ ...m, ...patch }), grupo)
  const preset =
    TAMANHOS.find(([, , w, h]) => w === modelo.largura && h === modelo.altura)?.[0] ?? 'personalizado'
  const fontes: [Fonte, string][] = [
    ['serifada', 'Serifada (Alegreya)'],
    ['sem-serifa', 'Sem serifa (Atkinson)'],
    ['condensada', 'Condensada (Barlow)'],
  ]
  return (
    <div className="inspetor">
      <Secao titulo="Modelo">
        <Linha rotulo="Nome do modelo" largo>
          <TextoInsp valor={modelo.nome} aoMudar={(t) => mudar({ nome: t }, 'nome-modelo')} />
        </Linha>
        <Linha rotulo="Fonte" largo>
          <Seletor valor={modelo.fonte} opcoes={fontes} aoMudar={(v) => mudar({ fonte: v })} />
        </Linha>
        <div className="cores">
          <Cor rotulo="Papel" valor={modelo.corFundo} aoMudar={(v) => mudar({ corFundo: v }, 'cor-fundo')} />
          <Cor rotulo="Tinta" valor={modelo.corTinta} aoMudar={(v) => mudar({ corTinta: v }, 'cor-tinta')} />
          <Cor rotulo="Destaque" valor={modelo.corDestaque} aoMudar={(v) => mudar({ corDestaque: v }, 'cor-destaque')} />
        </div>
        {p.folhaInvertida && (
          <p className="insp__nota insp__nota--depois">
            No modo escuro a folha aparece com papel e tinta trocados. O modelo guarda as cores acima, que são as
            usadas no modo claro.
          </p>
        )}
      </Secao>

      <Secao titulo="Página atual">
        <Linha rotulo="Nome da página" largo>
          <TextoInsp
            valor={pagina.nome}
            aoMudar={(t) =>
              p.aplicar(
                (m) => ({ ...m, paginas: m.paginas.map((x) => (x.id === pagina.id ? { ...x, nome: t } : x)) }),
                `nome-pagina:${pagina.id}`,
              )
            }
          />
        </Linha>
      </Secao>

      <Secao titulo="Tamanho da folha">
        <Linha rotulo="Formato" largo>
          <Seletor
            valor={preset}
            opcoes={[...TAMANHOS.map(([id, r, w, h]): [string, string] => [id, `${r}, ${w} × ${h}`]), ['personalizado', 'Personalizado']]}
            aoMudar={(v) => {
              const t = TAMANHOS.find(([id]) => id === v)
              if (t) mudar({ largura: t[2], altura: t[3] })
            }}
          />
        </Linha>
        <div className="insp__dupla">
          <Linha rotulo="Largura">
            <NumeroInsp valor={modelo.largura} min={200} max={4000} passo={modelo.grade || 1} aoMudar={(n) => n != null && mudar({ largura: Math.round(n) }, 'largura')} />
          </Linha>
          <Linha rotulo="Altura">
            <NumeroInsp valor={modelo.altura} min={200} max={6000} passo={modelo.grade || 1} aoMudar={(n) => n != null && mudar({ altura: Math.round(n) }, 'altura')} />
          </Linha>
        </div>
        <p className="insp__nota">Todas as páginas do modelo usam o mesmo tamanho.</p>
      </Secao>

      <Secao titulo="Grade">
        <Linha rotulo="Espaçamento">
          <Seletor
            valor={modelo.grade}
            opcoes={[
              [0, 'Sem grade'],
              [4, '4 px'],
              [8, '8 px'],
              [10, '10 px'],
              [16, '16 px'],
              [20, '20 px'],
              [24, '24 px'],
            ]}
            aoMudar={(v) => mudar({ grade: v })}
          />
        </Linha>
        <Alternar rotulo="Mostrar pontos da grade" marcado={p.mostrarGrade} aoMudar={p.setMostrarGrade} />
      </Secao>

      <Secao titulo="Atalhos">
        <dl className="atalhos">
          <dt>Shift + clique</dt>
          <dd>soma à seleção</dd>
          <dt>Arrastar no vazio</dt>
          <dd>seleciona por área</dd>
          <dt>Alt ao arrastar</dt>
          <dd>desliga o encaixe</dd>
          <dt>Setas</dt>
          <dd>movem 1 px, com Shift a grade</dd>
          <dt>Ctrl + D</dt>
          <dd>duplica</dd>
          <dt>Ctrl + C, Ctrl + V</dt>
          <dd>copia e cola</dd>
          <dt>Ctrl + Z, Ctrl + Y</dt>
          <dd>desfaz e refaz</dd>
        </dl>
      </Secao>
    </div>
  )
}

