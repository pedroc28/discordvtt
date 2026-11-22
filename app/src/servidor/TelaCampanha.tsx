// Tela de campanha: entrar no servidor, escolher a campanha e, para o mestre, cuidar de quem participa.
// Só lê o estado de useServidor() e chama os métodos de `conexao`: nada aqui fala com o PocketBase.

import { useEffect, useId, useState, type FormEvent } from 'react'
import { conexao, useServidor } from './conexao'
import { ehEnderecoLocal, linkDeConvite } from './endereco'
import { NOME_PAPEL, ehUnicoMestre, usuariosDisponiveis } from './operacoes'
import type { EstadoServidor, MinhaCampanha, Papel, ParticipanteVisivel } from './tipos'
import { ehPapel } from './validacao'

export function TelaCampanha() {
  const estado = useServidor()
  useEffect(() => {
    void conexao.iniciar()
  }, [])

  return (
    <div className="servidor">
      <div className="servidor__folha">{estado.fase === 'conectado' ? <Conectado estado={estado} /> : <Entrada estado={estado} />}</div>
    </div>
  )
}

/** Erro e aviso da última ação. As duas áreas existem sempre, para o leitor de tela anunciar a mudança. */
function Mensagens({ estado }: { estado: EstadoServidor }) {
  return (
    <>
      <p className="servidor__erro" role="alert">
        {estado.erro ?? ''}
      </p>
      <p className="servidor__aviso" role="status">
        {estado.aviso ?? ''}
      </p>
    </>
  )
}

// ---------- entrar ----------

function Entrada({ estado }: { estado: EstadoServidor }) {
  const [endereco, setEndereco] = useState(estado.endereco)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const aguardando = estado.fase === 'iniciando' || estado.fase === 'entrando'

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    void conexao.entrar(endereco, email, senha)
  }

  return (
    <form className="servidor__secao" onSubmit={enviar} noValidate>
      <div>
        <h1 className="servidor__titulo">Entrar no servidor</h1>
        <p className="servidor__dica">
          Use a conta que o administrador do servidor criou para você. Sem entrar, as fichas e o mapa continuam funcionando, salvos só neste navegador.
        </p>
        <Mensagens estado={estado} />
        {aguardando && (
          <p className="servidor__dica servidor__espera" role="status">
            Conectando a {estado.endereco}...
          </p>
        )}
      </div>

      <label className="servidor__campo">
        <span>Servidor</span>
        <input type="text" inputMode="url" autoComplete="url" spellCheck={false} value={endereco} onChange={(e) => setEndereco(e.target.value)} />
      </label>
      <label className="servidor__campo">
        <span>E-mail</span>
        <input type="email" autoComplete="username" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="servidor__campo">
        <span>Senha</span>
        <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </label>

      <div className="servidor__linha">
        <button type="submit" className="botao-topo botao-topo--principal" disabled={aguardando}>
          Entrar
        </button>
        {estado.sessaoSalva && (
          <button type="button" className="botao-topo" disabled={aguardando} onClick={() => void conexao.tentarDeNovo()}>
            Tentar de novo sem digitar a senha
          </button>
        )}
      </div>
    </form>
  )
}

// ---------- conectado ----------

function Conectado({ estado }: { estado: EstadoServidor }) {
  const atual = estado.campanhas.find((c) => c.id === estado.campanhaAtualId) ?? null

  return (
    <>
      <div>
        <div className="servidor__cabecalho">
          <div className="servidor__quem">
            <h1 className="servidor__titulo">{estado.usuario?.nome}</h1>
            <p className="servidor__dica">Conectado a {estado.endereco}</p>
          </div>
          <button type="button" className="botao-topo" onClick={() => conexao.sair()}>
            Sair do servidor
          </button>
        </div>
        {estado.semResposta && (
          <div className="servidor__queda" role="status">
            <p>O servidor parou de responder. O app tenta reconectar sozinho, e o que aparece aqui pode estar desatualizado.</p>
            <button type="button" className="botao-topo" onClick={() => void conexao.tentarDeNovo()}>
              Tentar agora
            </button>
          </div>
        )}
        <Mensagens estado={estado} />
      </div>
      <Convite endereco={estado.endereco} />
      <Campanhas estado={estado} />
      {atual && <CampanhaAberta key={atual.id} estado={estado} campanha={atual} />}
    </>
  )
}

/** Link do site que já abre com este servidor preenchido, para mandar aos amigos. */
function Convite({ endereco }: { endereco: string }) {
  const [resultado, setResultado] = useState('')

  if (ehEnderecoLocal(endereco)) {
    return (
      <p className="servidor__dica">
        Este endereço só funciona neste PC. Para chamar amigos, entre pelo endereço do Tailscale Funnel, e aqui aparece o link para mandar a eles.
      </p>
    )
  }

  const copiar = async () => {
    const link = linkDeConvite(window.location.href, endereco)
    try {
      await navigator.clipboard.writeText(link)
      setResultado('Link copiado. Mande aos amigos junto com o e-mail e a senha de cada um.')
    } catch {
      setResultado(`Não consegui copiar sozinho. Copie este link: ${link}`)
    }
  }

  return (
    <div className="servidor__linha">
      <button type="button" className="botao-topo" onClick={() => void copiar()}>
        Copiar link para os amigos
      </button>
      <p className="servidor__dica servidor__convite" role="status">
        {resultado}
      </p>
    </div>
  )
}

function Campanhas({ estado }: { estado: EstadoServidor }) {
  const titulo = useId()
  const [nome, setNome] = useState('')

  const criar = async (e: FormEvent) => {
    e.preventDefault()
    if (await conexao.criarCampanha(nome)) setNome('')
  }

  return (
    <section className="servidor__secao" aria-labelledby={titulo}>
      <h2 id={titulo} className="servidor__subtitulo">
        Suas campanhas
      </h2>
      {estado.campanhas.length === 0 ? (
        <p className="servidor__dica">Você ainda não está em nenhuma campanha. Crie uma aqui embaixo, ou peça a um mestre para adicionar você.</p>
      ) : (
        <ul className="servidor__lista">
          {estado.campanhas.map((c) => (
            <li key={c.id}>
              <button type="button" className="servidor__campanha" aria-pressed={c.id === estado.campanhaAtualId} onClick={() => conexao.escolherCampanha(c.id)}>
                <span className="servidor__nome">{c.nome}</span>
                <SeloPapel papel={c.papel} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="servidor__linha servidor__linha--base" onSubmit={criar}>
        <label className="servidor__campo servidor__campo--cresce">
          <span>Nova campanha</span>
          <input type="text" maxLength={80} placeholder="Nome da campanha" value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <button type="submit" className="botao-topo" disabled={estado.ocupado || !nome.trim()}>
          Criar campanha
        </button>
      </form>
    </section>
  )
}

function SeloPapel({ papel }: { papel: Papel }) {
  return <span className={`servidor__papel servidor__papel--${papel}`}>{NOME_PAPEL[papel]}</span>
}

// ---------- campanha aberta ----------

interface PropsCampanha {
  estado: EstadoServidor
  campanha: MinhaCampanha
}

function CampanhaAberta({ estado, campanha }: PropsCampanha) {
  const titulo = useId()
  const mestre = campanha.papel === 'mestre'

  return (
    <section className="servidor__secao servidor__secao--aberta" aria-labelledby={titulo}>
      <div>
        <h2 id={titulo} className="servidor__subtitulo">
          {campanha.nome}
        </h2>
        <p className="servidor__dica">
          {mestre
            ? 'Você é mestre desta campanha: pode renomear, chamar e tirar pessoas e trocar papéis.'
            : 'Você é jogador desta campanha. Só um mestre muda quem participa.'}
        </p>
      </div>
      {mestre && <Renomear key={campanha.nome} campanha={campanha} ocupado={estado.ocupado} />}
      <Participantes estado={estado} mestre={mestre} />
      {mestre && <Adicionar estado={estado} />}
      <Perigo estado={estado} campanha={campanha} />
    </section>
  )
}

function Renomear({ campanha, ocupado }: { campanha: MinhaCampanha; ocupado: boolean }) {
  const [nome, setNome] = useState(campanha.nome)
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    void conexao.renomearCampanha(nome)
  }
  return (
    <form className="servidor__linha servidor__linha--base" onSubmit={enviar}>
      <label className="servidor__campo servidor__campo--cresce">
        <span>Nome da campanha</span>
        <input type="text" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
      </label>
      <button type="submit" className="botao-topo" disabled={ocupado || !nome.trim() || nome.trim() === campanha.nome}>
        Renomear
      </button>
    </form>
  )
}

function Participantes({ estado, mestre }: { estado: EstadoServidor; mestre: boolean }) {
  const rotulo = useId()
  const lista = estado.participantes
  return (
    <div className="servidor__campo">
      <span id={rotulo}>Quem participa</span>
      {lista.length === 0 ? (
        <p className="servidor__dica">Carregando...</p>
      ) : (
        <ul className="servidor__lista" aria-labelledby={rotulo}>
          {lista.map((p) => (
            <Participante key={p.id} participante={p} mestre={mestre} unico={ehUnicoMestre(lista, p.id)} ocupado={estado.ocupado} />
          ))}
        </ul>
      )}
    </div>
  )
}

interface PropsParticipante {
  participante: ParticipanteVisivel
  mestre: boolean
  unico: boolean
  ocupado: boolean
}

function Participante({ participante: p, mestre, unico, ocupado }: PropsParticipante) {
  const trocar = (valor: string) => {
    if (ehPapel(valor)) void conexao.mudarPapel(p.id, valor)
  }
  return (
    <li className="servidor__participante">
      <span className="servidor__nome">
        {p.nome}
        {p.euMesmo && <span className="servidor__voce"> (você)</span>}
      </span>
      {mestre ? (
        <select
          className="servidor__selecao"
          aria-label={`Papel de ${p.nome}`}
          title={unico ? 'Única pessoa mestre: torne outra pessoa mestre antes.' : undefined}
          value={p.papel}
          disabled={ocupado || unico}
          onChange={(e) => trocar(e.target.value)}
        >
          <option value="mestre">Mestre</option>
          <option value="jogador">Jogador</option>
        </select>
      ) : (
        <SeloPapel papel={p.papel} />
      )}
      {mestre && !p.euMesmo && (
        <button type="button" className="botao-topo" disabled={ocupado || unico} aria-label={`Tirar ${p.nome} da campanha`} onClick={() => void conexao.removerParticipante(p.id)}>
          Tirar
        </button>
      )}
    </li>
  )
}

function Adicionar({ estado }: { estado: EstadoServidor }) {
  const disponiveis = usuariosDisponiveis(estado.usuarios, estado.participantes)
  const [usuarioId, setUsuarioId] = useState('')
  const [papel, setPapel] = useState<Papel>('jogador')
  const escolhido = disponiveis.some((u) => u.id === usuarioId) ? usuarioId : ''

  if (disponiveis.length === 0) {
    return (
      <p className="servidor__dica">
        Todas as contas do servidor já estão nesta campanha. Para chamar mais alguém, o administrador cria a conta da pessoa no painel do PocketBase.
      </p>
    )
  }

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (escolhido && (await conexao.adicionarParticipante(escolhido, papel))) setUsuarioId('')
  }

  return (
    <form className="servidor__linha servidor__linha--base" onSubmit={enviar}>
      <label className="servidor__campo servidor__campo--cresce">
        <span>Chamar para a campanha</span>
        <select value={escolhido} onChange={(e) => setUsuarioId(e.target.value)}>
          <option value="">Escolha uma conta</option>
          {disponiveis.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="servidor__campo">
        <span>Papel</span>
        <select value={papel} onChange={(e) => ehPapel(e.target.value) && setPapel(e.target.value)}>
          <option value="jogador">Jogador</option>
          <option value="mestre">Mestre</option>
        </select>
      </label>
      <button type="submit" className="botao-topo" disabled={estado.ocupado || !escolhido}>
        Adicionar
      </button>
    </form>
  )
}

function Perigo({ estado, campanha }: PropsCampanha) {
  const [confirmando, setConfirmando] = useState<'sair' | 'apagar' | null>(null)
  const eu = estado.participantes.find((p) => p.euMesmo)
  const unico = eu ? ehUnicoMestre(estado.participantes, eu.id) : false
  const mestre = campanha.papel === 'mestre'

  if (confirmando === 'sair' && eu) {
    return (
      <div className="servidor__perigo">
        <p>
          Sair da campanha <strong>{campanha.nome}</strong>? Para voltar, um mestre precisa chamar você de novo.
        </p>
        <div className="servidor__linha">
          <button
            type="button"
            className="botao-topo servidor__botao-perigo"
            disabled={estado.ocupado}
            onClick={() => {
              setConfirmando(null)
              void conexao.removerParticipante(eu.id)
            }}
          >
            Sair da campanha
          </button>
          <button type="button" className="botao-topo" onClick={() => setConfirmando(null)}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  if (confirmando === 'apagar') {
    return (
      <div className="servidor__perigo">
        <p>
          Apagar a campanha <strong>{campanha.nome}</strong>? Todos saem dela junto, e não dá para desfazer.
        </p>
        <div className="servidor__linha">
          <button
            type="button"
            className="botao-topo servidor__botao-perigo"
            disabled={estado.ocupado}
            onClick={() => {
              setConfirmando(null)
              void conexao.apagarCampanha()
            }}
          >
            Apagar campanha
          </button>
          <button type="button" className="botao-topo" onClick={() => setConfirmando(null)}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="servidor__perigo">
      <div className="servidor__linha">
        {eu && (
          <button type="button" className="botao-topo" disabled={estado.ocupado || unico} onClick={() => setConfirmando('sair')}>
            Sair da campanha
          </button>
        )}
        {mestre && (
          <button type="button" className="botao-topo servidor__botao-perigo" disabled={estado.ocupado} onClick={() => setConfirmando('apagar')}>
            Apagar campanha
          </button>
        )}
      </div>
      {unico && <p className="servidor__dica">Você é a única pessoa mestre. Para sair, torne outra pessoa mestre antes.</p>}
    </div>
  )
}
