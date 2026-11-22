// Aba lateral do mapa, recolhível: calcula viagem (rota, dias) e provisões (rações, água, peso, carga).
// Só desenha e repassa as mudanças. As contas ficam em viagem.ts.

import { useState } from 'react'
import { Icone } from './Icones'
import {
  MULTIPLICADOR_RITMO,
  ROTULO_RITMO,
  calcularProvisoes,
  textoDeDuracao,
  type ConfigViagem,
  type Ritmo,
  type ResumoViagem,
} from './viagem'

export type ResultadoDaRota =
  | { ok: true; resumo: ResumoViagem; terrenos: { terreno: string; nome: string; n: number }[]; pontos: number }
  | { ok: false; trecho: number }

interface Props {
  aberto: boolean
  aoAlternar: () => void
  config: ConfigViagem
  aoMudarConfig: (c: ConfigViagem) => void
  /** Null enquanto não há pelo menos dois pontos marcados. */
  rota: ResultadoDaRota | null
  pontosMarcados: number
  rotaAtiva: boolean
  aoMarcarRota: () => void
  aoDesfazerPonto: () => void
  aoLimparRota: () => void
  comecarNoToken: boolean
  aoMudarComecarNoToken: (v: boolean) => void
  temToken: boolean
}

const n1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','))

/** Campo numérico que deixa digitar à vontade e só corrige o texto ao sair do campo. */
function Campo({ rotulo, valor, passo = 1, sufixo, aoMudar }: { rotulo: string; valor: number; passo?: number; sufixo?: string; aoMudar: (v: number) => void }) {
  const [texto, setTexto] = useState(String(valor))
  return (
    <label className="viagem__campo">
      <span>{rotulo}</span>
      <span className="viagem__entrada">
        <input
          type="number"
          inputMode="decimal"
          step={passo}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            const v = parseFloat(e.target.value)
            if (Number.isFinite(v)) aoMudar(v)
          }}
          onBlur={() => setTexto(String(valor))}
        />
        {sufixo && <small>{sufixo}</small>}
      </span>
    </label>
  )
}

export function PainelViagem(p: Props) {
  const { config, aoMudarConfig } = p
  const muda = (parcial: Partial<ConfigViagem>) => aoMudarConfig({ ...config, ...parcial })

  if (!p.aberto) {
    return (
      <aside className="mapa__viagem mapa__viagem--recolhida" aria-label="Viagem e provisões, recolhida">
        <button type="button" className="botao-icone" title="Abrir a aba de viagem e provisões" aria-label="Abrir a aba de viagem e provisões" onClick={p.aoAlternar}>
          <Icone nome="lateral" />
        </button>
        <span className="viagem__vertical">Viagem e provisões</span>
      </aside>
    )
  }

  const dias = p.rota?.ok ? p.rota.resumo.diasDeProvisao : config.diasManuais
  const prov = calcularProvisoes(config, dias)
  const usoCarga = prov.capacidade > 0 ? Math.min(100, Math.round((prov.peso / prov.capacidade) * 100)) : prov.peso > 0 ? 100 : 0

  return (
    <aside className="mapa__viagem" aria-label="Viagem e provisões">
      <header className="viagem__topo">
        <h2>Viagem e provisões</h2>
        <button type="button" className="botao-icone" title="Recolher a aba" aria-label="Recolher a aba de viagem e provisões" onClick={p.aoAlternar}>
          <Icone nome="fechar" />
        </button>
      </header>

      <div className="viagem__corpo">
        <section className="viagem__secao">
          <h3>Grupo</h3>
          <div className="viagem__grade">
            <Campo rotulo="Viajantes" valor={config.viajantes} aoMudar={(v) => muda({ viajantes: v })} />
            <Campo rotulo="Montarias e carga" valor={config.montarias} aoMudar={(v) => muda({ montarias: v })} />
          </div>
        </section>

        <section className="viagem__secao">
          <h3>Mundo e ritmo</h3>
          <div className="viagem__grade">
            <Campo rotulo="1 hexágono vale" valor={config.kmPorHex} passo={0.5} sufixo="km" aoMudar={(v) => muda({ kmPorHex: v })} />
            <Campo rotulo="Marcha normal" valor={config.kmPorDia} sufixo="km/dia" aoMudar={(v) => muda({ kmPorDia: v })} />
          </div>
          <div className="modo" role="radiogroup" aria-label="Ritmo da viagem">
            {(Object.keys(ROTULO_RITMO) as Ritmo[]).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={config.ritmo === r} title={`${ROTULO_RITMO[r]}: ${n1(config.kmPorDia * MULTIPLICADOR_RITMO[r])} km/dia`} onClick={() => muda({ ritmo: r })}>
                {ROTULO_RITMO[r]}
              </button>
            ))}
          </div>
        </section>

        <section className="viagem__secao">
          <h3>Rota</h3>
          <div className="viagem__botoes">
            <button type="button" className="botao-topo" aria-pressed={p.rotaAtiva} onClick={p.aoMarcarRota}>
              {p.rotaAtiva ? 'Marcando no mapa' : 'Marcar rota no mapa'}
            </button>
            <button type="button" className="botao-topo" disabled={p.pontosMarcados === 0} onClick={p.aoDesfazerPonto}>
              Tirar o último ponto
            </button>
            <button type="button" className="botao-topo" disabled={p.pontosMarcados === 0} onClick={p.aoLimparRota}>
              Limpar rota
            </button>
          </div>
          <label className="viagem__marca">
            <input type="checkbox" checked={p.comecarNoToken} disabled={!p.temToken} onChange={(e) => p.aoMudarComecarNoToken(e.target.checked)} />
            Começar no token do grupo
          </label>
          {!p.temToken && <p className="viagem__dica">Ainda não há token no mapa. Com a ferramenta Token, toque num hexágono.</p>}

          {p.rota === null && (
            <p className="viagem__dica">
              {p.pontosMarcados === 0
                ? 'Ative "Marcar rota no mapa" e toque nos hexágonos, na ordem da viagem. O caminho mais barato entre os pontos é calculado sozinho.'
                : 'Falta um ponto: marque o destino.'}
            </p>
          )}
          {p.rota && !p.rota.ok && (
            <p className="viagem__alerta" role="alert">
              Não há caminho entre os pontos {p.rota.trecho} e {p.rota.trecho + 1}. Pode haver água aberta ou hexágono vazio no meio.
            </p>
          )}
          {p.rota?.ok && (
            <dl className="viagem__resultado" aria-live="polite">
              <div><dt>Passos</dt><dd>{p.rota.resumo.passos} hexágonos ({n1(p.rota.resumo.km)} km)</dd></div>
              <div><dt>Esforço</dt><dd>{n1(p.rota.resumo.kmEquivalentes)} km de planície</dd></div>
              <div><dt>Marcha</dt><dd>{n1(p.rota.resumo.kmPorDiaReal)} km/dia</dd></div>
              <div className="viagem__destaque"><dt>Duração</dt><dd>{textoDeDuracao(p.rota.resumo.dias)}</dd></div>
            </dl>
          )}
          {p.rota?.ok && p.rota.terrenos.length > 0 && (
            <p className="viagem__dica">Terrenos: {p.rota.terrenos.map((t) => `${t.nome} (${t.n})`).join(', ')}.</p>
          )}
        </section>

        <section className="viagem__secao">
          <h3>Provisões para {dias} {dias === 1 ? 'dia' : 'dias'}</h3>
          {!p.rota?.ok && (
            <Campo rotulo="Dias de viagem (sem rota)" valor={config.diasManuais} aoMudar={(v) => muda({ diasManuais: v })} />
          )}
          <dl className="viagem__resultado" aria-live="polite">
            <div><dt>Rações</dt><dd>{n1(prov.racoes)}{prov.faltamRacoes > 0 && config.estoqueRacoes > 0 ? ` (faltam ${n1(prov.faltamRacoes)})` : ''}</dd></div>
            <div><dt>Água</dt><dd>{n1(prov.agua)} L{prov.faltamAgua > 0 && config.estoqueAgua > 0 ? ` (faltam ${n1(prov.faltamAgua)})` : ''}</dd></div>
            <div><dt>Peso</dt><dd>{n1(prov.peso)} de {n1(prov.capacidade)} kg</dd></div>
          </dl>
          <div className="viagem__barra" role="img" aria-label={`Carga em ${usoCarga}% da capacidade`}>
            <span className={prov.sobrecarregado ? 'viagem__barra-cheia viagem__barra-cheia--alerta' : 'viagem__barra-cheia'} style={{ width: `${usoCarga}%` }} />
          </div>
          {prov.sobrecarregado && (
            <p className="viagem__alerta" role="alert">
              O grupo não carrega tudo: faltam {n1(prov.peso - prov.capacidade)} kg de capacidade. Leve mais montarias, divida a viagem em etapas ou reabasteça no caminho.
            </p>
          )}
          <p className="viagem__dica">
            Consumo por dia: {n1(prov.racoesPorDia)} rações e {n1(prov.aguaPorDia)} L.
            {Number.isFinite(prov.diasDoEstoque) && (config.estoqueRacoes > 0 || config.estoqueAgua > 0)
              ? ` O estoque atual dura ${n1(Math.floor(prov.diasDoEstoque * 10) / 10)} dias.`
              : ''}
          </p>

          <details className="viagem__ajustes">
            <summary>Estoque, consumo e carga</summary>
            <div className="viagem__grade">
              <Campo rotulo="Rações que o grupo tem" valor={config.estoqueRacoes} aoMudar={(v) => muda({ estoqueRacoes: v })} />
              <Campo rotulo="Água que o grupo tem" valor={config.estoqueAgua} sufixo="L" aoMudar={(v) => muda({ estoqueAgua: v })} />
              <Campo rotulo="Ração por pessoa" valor={config.racaoPorPessoa} passo={0.5} sufixo="/dia" aoMudar={(v) => muda({ racaoPorPessoa: v })} />
              <Campo rotulo="Água por pessoa" valor={config.aguaPorPessoa} passo={0.5} sufixo="L/dia" aoMudar={(v) => muda({ aguaPorPessoa: v })} />
              <Campo rotulo="Ração por montaria" valor={config.racaoPorMontaria} passo={0.5} sufixo="/dia" aoMudar={(v) => muda({ racaoPorMontaria: v })} />
              <Campo rotulo="Água por montaria" valor={config.aguaPorMontaria} passo={0.5} sufixo="L/dia" aoMudar={(v) => muda({ aguaPorMontaria: v })} />
              <Campo rotulo="Peso da ração" valor={config.pesoRacao} passo={0.1} sufixo="kg" aoMudar={(v) => muda({ pesoRacao: v })} />
              <Campo rotulo="Peso da água" valor={config.pesoAgua} passo={0.1} sufixo="kg/L" aoMudar={(v) => muda({ pesoAgua: v })} />
              <Campo rotulo="Carga por viajante" valor={config.cargaPorViajante} sufixo="kg" aoMudar={(v) => muda({ cargaPorViajante: v })} />
              <Campo rotulo="Carga por montaria" valor={config.cargaPorMontaria} sufixo="kg" aoMudar={(v) => muda({ cargaPorMontaria: v })} />
            </div>
          </details>
        </section>

        <p className="viagem__dica viagem__regras">
          Regras de jogo, ajustáveis: estrada custa metade, cruzar rio sem ponte soma 1, água aberta não se atravessa, e floresta, montanha e pântano são mais lentos que a planície. O dia tem 8 horas de marcha.
        </p>
      </div>
    </aside>
  )
}
