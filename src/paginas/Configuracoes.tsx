import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CheckCircle2, Eye, EyeOff, Fuel, Loader2, Pencil, Plus, Star, Trash2, Upload, XCircle } from 'lucide-react'
import { chamarFuncao, supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { BUCKET_LOGOS, useMarca } from '../lib/marca'
import type { ConfiguracaoIA, ParametroMistura, Provedor } from '../lib/tipos'
import { Dialogo, DialogoConfirmacao } from '../componentes/Dialogo'
import { useAvisos } from '../componentes/Avisos'

const PROVEDORES: { valor: Provedor; rotulo: string }[] = [
  { valor: 'anthropic', rotulo: 'Anthropic (Claude)' },
  { valor: 'openai', rotulo: 'OpenAI' },
  { valor: 'google_gemini', rotulo: 'Google Gemini' },
  { valor: 'azure_openai', rotulo: 'Azure OpenAI' },
  { valor: 'compativel_openai', rotulo: 'Compatível com a API da OpenAI (Ollama, OpenRouter, Groq…)' },
]
const rotuloProvedor = (p: Provedor) => PROVEDORES.find((x) => x.valor === p)?.rotulo ?? p

/** Sugestões de modelo; o campo aceita qualquer nome, porque as listas mudam com frequência. */
const SUGESTOES: Partial<Record<Provedor, string[]>> = {
  anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
}

/** Atributos que impedem o navegador e gerenciadores de senha de preencher os campos com o login do app. */
const SEM_AUTOPREENCHER = { 'data-lpignore': 'true', 'data-1p-ignore': 'true', 'data-bwignore': 'true', 'data-form-type': 'other' } as const

const SENHA_MINIMA = 6

const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
const LIMITE_LOGO = 2 * 1024 * 1024

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e))

/** Traduz as mensagens mais comuns do Supabase Auth na troca de senha. */
function mensagemSenha(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('different from the old')) return 'A nova senha precisa ser diferente da atual.'
  if (m.includes('at least')) return `A senha é curta demais. Use pelo menos ${msg.match(/\d+/)?.[0] ?? SENHA_MINIMA} caracteres.`
  if (m.includes('weak') || m.includes('pwned') || m.includes('leaked')) return 'Essa senha é fraca ou já apareceu em vazamentos. Escolha outra.'
  if (m.includes('reauthentication') || m.includes('nonce')) return 'Por segurança, saia e entre de novo antes de trocar a senha.'
  return msg
}

interface Formulario {
  id?: string
  nome: string
  provedor: Provedor
  modelo: string
  url_base: string
  nome_deployment: string
  versao_api: string
  chave: string
  mascara: string | null
  temperatura: string
  limite_tokens: string
  padrao: boolean
}

const VAZIO: Formulario = {
  nome: '',
  provedor: 'anthropic',
  modelo: '',
  url_base: '',
  nome_deployment: '',
  versao_api: '2024-10-21',
  chave: '',
  mascara: null,
  temperatura: '',
  limite_tokens: '4096',
  padrao: false,
}

type Teste = { estado: 'testando' } | { estado: 'ok' | 'erro'; mensagem: string }

function Secao({ titulo, descricao, children, acao }: { titulo: string; descricao: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="cartao">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divisor px-6 py-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-texto-forte">{titulo}</h2>
          <p className="mt-1 text-sm text-texto-secundario">{descricao}</p>
        </div>
        {acao}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  )
}

export function Configuracoes() {
  const { sessao, perfil, recarregarPerfil } = useSessao()
  const { logoUrl, logoCaminho, recarregarMarca } = useMarca()
  const avisar = useAvisos()
  const loginSool = (sessao?.user.app_metadata as { login?: string } | undefined)?.login === 'sool'
  const [configs, setConfigs] = useState<ConfiguracaoIA[]>([])
  const [form, setForm] = useState<Formulario | null>(null)
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [verChave, setVerChave] = useState(false)
  const [testes, setTestes] = useState<Record<string, Teste>>({})
  const [paraExcluir, setParaExcluir] = useState<ConfiguracaoIA | null>(null)
  const [parametros, setParametros] = useState<ParametroMistura[]>([])
  const [nome, setNome] = useState('')
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('')
  const [verSenhas, setVerSenhas] = useState(false)
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const seletorLogo = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    const [c, p] = await Promise.all([
      supabase.from('configuracoes_ia').select('id, nome, provedor, modelo, url_base, nome_deployment, versao_api, chave_api_mascara, temperatura, limite_tokens, padrao').order('criado_em'),
      supabase.from('parametros_mistura').select('id, produto_final, componente, percentual, referencia, vigencia_inicio').order('id'),
    ])
    setConfigs((c.data as ConfiguracaoIA[]) ?? [])
    setParametros((p.data as ParametroMistura[]) ?? [])
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])
  useEffect(() => setNome(perfil?.nome ?? ''), [perfil])

  const editar = (c?: ConfiguracaoIA) => {
    setErroForm(null)
    setVerChave(false)
    setForm(
      c
        ? {
            id: c.id,
            nome: c.nome,
            provedor: c.provedor,
            modelo: c.modelo,
            url_base: c.url_base ?? '',
            nome_deployment: c.nome_deployment ?? '',
            versao_api: c.versao_api ?? '',
            chave: '',
            mascara: c.chave_api_mascara,
            temperatura: c.temperatura === null ? '' : String(c.temperatura),
            limite_tokens: String(c.limite_tokens),
            padrao: c.padrao,
          }
        : { ...VAZIO, padrao: configs.length === 0 },
    )
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    const f = form
    const precisaUrl = f.provedor === 'azure_openai' || f.provedor === 'compativel_openai'
    const modelo = f.provedor === 'azure_openai' ? f.modelo.trim() || f.nome_deployment.trim() : f.modelo.trim()
    if (!f.nome.trim()) return setErroForm('Informe um nome para a configuração.')
    if (!modelo) return setErroForm('Informe o modelo.')
    if (precisaUrl && !/^https?:\/\//.test(f.url_base.trim())) return setErroForm('Informe a URL base, começando com http:// ou https://.')
    if (f.provedor === 'azure_openai' && !f.nome_deployment.trim()) return setErroForm('Informe o nome do deployment do Azure.')
    if (!f.id && !f.chave.trim() && f.provedor !== 'compativel_openai') return setErroForm('Informe a chave de API.')
    const temperatura = f.temperatura.trim() === '' ? null : Number(f.temperatura.replace(',', '.'))
    if (temperatura !== null && (Number.isNaN(temperatura) || temperatura < 0 || temperatura > 2)) return setErroForm('A temperatura deve estar entre 0 e 2, ou em branco.')
    const limite = Number(f.limite_tokens)
    if (!Number.isInteger(limite) || limite < 256 || limite > 64000) return setErroForm('O limite de tokens deve ser um número entre 256 e 64.000.')

    setSalvando(true)
    setErroForm(null)
    try {
      const padrao = f.padrao || configs.length === 0 || (configs.length === 1 && configs[0].id === f.id)
      if (padrao) {
        const r = await supabase.from('configuracoes_ia').update({ padrao: false }).eq('padrao', true).neq('id', f.id ?? '00000000-0000-0000-0000-000000000000')
        if (r.error) throw r.error
      }
      const dados = {
        nome: f.nome.trim(),
        provedor: f.provedor,
        modelo,
        url_base: precisaUrl ? f.url_base.trim() : null,
        nome_deployment: f.provedor === 'azure_openai' ? f.nome_deployment.trim() : null,
        versao_api: f.provedor === 'azure_openai' ? f.versao_api.trim() || null : null,
        temperatura,
        limite_tokens: limite,
        padrao,
      }
      const r = f.id
        ? await supabase.from('configuracoes_ia').update(dados).eq('id', f.id).select('id').single()
        : await supabase.from('configuracoes_ia').insert({ ...dados, usuario_id: sessao!.user.id }).select('id').single()
      if (r.error || !r.data) throw r.error ?? new Error('sem resposta')
      if (f.chave.trim()) {
        const k = await supabase.rpc('salvar_chave_ia', { p_config_id: r.data.id, p_chave: f.chave.trim() })
        if (k.error) throw k.error
      }
      setForm(null)
      avisar('Configuração salva.')
      await carregar()
    } catch (e) {
      setErroForm(`Não foi possível salvar: ${mensagemDe(e)}`)
    } finally {
      setSalvando(false)
    }
  }

  const testar = async (c: ConfiguracaoIA) => {
    setTestes((t) => ({ ...t, [c.id]: { estado: 'testando' } }))
    const r = await chamarFuncao<{ resposta?: string; tempo_ms?: number }>('testar-ia', { configuracao_id: c.id })
    setTestes((t) => ({
      ...t,
      [c.id]: r.ok
        ? { estado: 'ok', mensagem: `Conectado em ${((r.tempo_ms ?? 0) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s. Resposta: “${r.resposta}”` }
        : { estado: 'erro', mensagem: r.erro ?? 'Falha na conexão.' },
    }))
  }

  const tornarPadrao = async (c: ConfiguracaoIA) => {
    await supabase.from('configuracoes_ia').update({ padrao: false }).eq('padrao', true)
    const { error } = await supabase.from('configuracoes_ia').update({ padrao: true }).eq('id', c.id)
    if (error) avisar(error.message, 'erro')
    await carregar()
  }

  const excluir = async () => {
    const c = paraExcluir
    setParaExcluir(null)
    if (!c) return
    const { error } = await supabase.from('configuracoes_ia').delete().eq('id', c.id)
    if (error) return avisar(`Não foi possível excluir: ${error.message}`, 'erro')
    avisar('Configuração excluída.')
    await carregar()
  }

  const salvarParametros = async () => {
    for (const p of parametros) {
      if (!p.produto_final.trim() || !p.componente.trim() || Number.isNaN(Number(p.percentual))) {
        return avisar('Preencha produto, componente e percentual de todos os parâmetros.', 'erro')
      }
    }
    const linha = (p: ParametroMistura) => ({
      produto_final: p.produto_final.trim(),
      componente: p.componente.trim(),
      percentual: Number(p.percentual),
      referencia: p.referencia?.trim() || null,
      vigencia_inicio: p.vigencia_inicio || null,
    })
    let error: { message: string } | null = null
    for (const p of parametros.filter((x) => x.id > 0)) {
      const r = await supabase.from('parametros_mistura').update(linha(p)).eq('id', p.id)
      if (r.error) error = r.error
    }
    const novos = parametros.filter((x) => x.id <= 0).map((p) => ({ ...linha(p), usuario_id: sessao!.user.id }))
    if (novos.length) {
      const r = await supabase.from('parametros_mistura').insert(novos)
      if (r.error) error = r.error
    }
    if (error) return avisar(`Não foi possível salvar os parâmetros: ${error.message}`, 'erro')
    avisar('Parâmetros de mistura salvos.')
    await carregar()
  }

  const removerParametro = async (p: ParametroMistura) => {
    if (p.id > 0) {
      const { error } = await supabase.from('parametros_mistura').delete().eq('id', p.id)
      if (error) return avisar(error.message, 'erro')
    }
    setParametros((lista) => lista.filter((x) => x !== p))
  }

  const salvarPerfil = async () => {
    if (!nome.trim()) return avisar('Informe o nome.', 'erro')
    const { error } = await supabase.from('perfis').update({ nome: nome.trim() }).eq('id', sessao!.user.id)
    if (error) return avisar(error.message, 'erro')
    await recarregarPerfil()
    avisar('Perfil atualizado.')
  }

  const escolherLogo = async (arquivo: File | undefined) => {
    if (seletorLogo.current) seletorLogo.current.value = ''
    if (!arquivo) return
    if (!TIPOS_LOGO.includes(arquivo.type)) return avisar('Escolha uma imagem PNG, JPG, WEBP, GIF ou SVG.', 'erro')
    if (arquivo.size > LIMITE_LOGO) return avisar('A imagem deve ter no máximo 2 MB.', 'erro')
    setEnviandoLogo(true)
    try {
      const extensao = (arquivo.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
      const caminho = `logo-${Date.now()}.${extensao}`
      const envio = await supabase.storage.from(BUCKET_LOGOS).upload(caminho, arquivo, { contentType: arquivo.type, cacheControl: '31536000' })
      if (envio.error) throw envio.error
      const r = await supabase.from('configuracoes_app').update({ logo_caminho: caminho }).eq('id', 1)
      if (r.error) {
        await supabase.storage.from(BUCKET_LOGOS).remove([caminho])
        throw r.error
      }
      if (logoCaminho) await supabase.storage.from(BUCKET_LOGOS).remove([logoCaminho])
      await recarregarMarca()
      avisar('Logo atualizado.')
    } catch (e) {
      avisar(`Não foi possível enviar o logo: ${mensagemDe(e)}`, 'erro')
    } finally {
      setEnviandoLogo(false)
    }
  }

  const removerLogo = async () => {
    setEnviandoLogo(true)
    try {
      const r = await supabase.from('configuracoes_app').update({ logo_caminho: null }).eq('id', 1)
      if (r.error) throw r.error
      if (logoCaminho) await supabase.storage.from(BUCKET_LOGOS).remove([logoCaminho])
      await recarregarMarca()
      avisar('Logo removido.')
    } catch (e) {
      avisar(`Não foi possível remover o logo: ${mensagemDe(e)}`, 'erro')
    } finally {
      setEnviandoLogo(false)
    }
  }

  const trocarSenha = async (e: FormEvent) => {
    e.preventDefault()
    setErroSenha(null)
    const email = sessao?.user.email
    if (!email) return setErroSenha('Não foi possível identificar o usuário. Saia e entre de novo.')
    if (!senhaAtual) return setErroSenha('Informe a senha atual.')
    if (novaSenha.length < SENHA_MINIMA) return setErroSenha(`A nova senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`)
    if (novaSenha !== confirmacaoSenha) return setErroSenha('A confirmação não é igual à nova senha.')
    if (novaSenha === senhaAtual) return setErroSenha('A nova senha precisa ser diferente da atual.')
    setTrocandoSenha(true)
    try {
      const conferencia = await supabase.auth.signInWithPassword({ email, password: senhaAtual })
      if (conferencia.error) {
        return setErroSenha(conferencia.error.message === 'Invalid login credentials' ? 'A senha atual está incorreta.' : mensagemSenha(conferencia.error.message))
      }
      const { error } = await supabase.auth.updateUser({ password: novaSenha })
      if (error) return setErroSenha(mensagemSenha(error.message))
      setSenhaAtual('')
      setNovaSenha('')
      setConfirmacaoSenha('')
      setVerSenhas(false)
      avisar('Senha alterada. Use a nova senha no próximo acesso.')
    } catch (erro) {
      setErroSenha(mensagemDe(erro))
    } finally {
      setTrocandoSenha(false)
    }
  }

  const mudarParametro = (i: number, campo: keyof ParametroMistura, valor: string) =>
    setParametros((lista) => lista.map((p, k) => (k === i ? { ...p, [campo]: campo === 'percentual' ? (valor.replace(',', '.') as unknown as number) : valor } : p)))

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="titulo-pagina">Configurações</h1>
        <p className="subtitulo-pagina">Plataforma de IA, identidade visual, parâmetros de mistura e sua conta.</p>
      </div>

      <Secao
        titulo="Plataforma de IA"
        descricao="Escolha qual IA responde às perguntas. A chave de API fica guardada criptografada no Supabase e não volta para o navegador."
        acao={
          <button className="botao-acao-rotulo" onClick={() => editar()}>
            <Plus size={18} /> Nova configuração
          </button>
        }
      >
        {configs.length === 0 ? (
          <p className="py-2 text-sm">Nenhuma plataforma configurada. Cadastre uma para começar a fazer perguntas.</p>
        ) : (
          <ul className="divide-y divide-divisor">
            {configs.map((c) => {
              const t = testes[c.id]
              return (
                <li key={c.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-texto-forte">
                        {c.nome}
                        {c.padrao && <span className="ml-2 rounded-md bg-[#EEF6EF] px-1.5 py-0.5 text-[11px] font-medium text-texto-verde">Padrão</span>}
                      </p>
                      <p className="text-sm text-texto-secundario">
                        {rotuloProvedor(c.provedor)} · modelo {c.modelo}
                        {c.chave_api_mascara ? ` · chave ${c.chave_api_mascara}` : ' · sem chave'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="botao-secundario h-9" onClick={() => void testar(c)} disabled={t?.estado === 'testando'}>
                        {t?.estado === 'testando' && <Loader2 size={15} className="animate-spin" />}
                        Testar conexão
                      </button>
                      {!c.padrao && (
                        <button className="botao-icone" onClick={() => void tornarPadrao(c)} title="Tornar padrão" aria-label={`Tornar ${c.nome} padrão`}>
                          <Star size={17} />
                        </button>
                      )}
                      <button className="botao-icone" onClick={() => editar(c)} title="Editar" aria-label={`Editar ${c.nome}`}>
                        <Pencil size={17} />
                      </button>
                      <button className="botao-icone" onClick={() => setParaExcluir(c)} title="Excluir" aria-label={`Excluir ${c.nome}`}>
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                  {t && t.estado !== 'testando' && (
                    <p className={`mt-2 flex items-start gap-2 text-sm ${t.estado === 'ok' ? 'text-texto-verde' : 'text-erro'}`}>
                      {t.estado === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
                      <span className="break-words">{t.mensagem}</span>
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Secao>

      <Secao
        titulo="Logo"
        descricao="Imagem exibida no cabeçalho, antes do nome SOOL2.ai, para todos os usuários. PNG, JPG, WEBP, GIF ou SVG, até 2 MB."
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 min-w-[13rem] items-center gap-3 rounded-lg border border-divisor bg-white px-4 shadow-suave" aria-label="Prévia do cabeçalho">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo atual" className="h-8 w-auto max-w-[8rem] object-contain" />
            ) : (
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primaria-escura text-white" aria-hidden>
                <Fuel size={17} />
              </span>
            )}
            <span className="text-lg font-semibold tracking-tight text-texto-forte">
              SOOL2<span className="text-texto-verde">.ai</span> - v1
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="botao-secundario" onClick={() => seletorLogo.current?.click()} disabled={enviandoLogo}>
              {enviandoLogo ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {logoUrl ? 'Trocar imagem' : 'Escolher imagem'}
            </button>
            {logoUrl && (
              <button className="botao-secundario" onClick={() => void removerLogo()} disabled={enviandoLogo}>
                <Trash2 size={16} />
                Remover
              </button>
            )}
          </div>
          <input
            ref={seletorLogo}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={(e) => void escolherLogo(e.target.files?.[0])}
          />
        </div>
        <p className="mt-3 text-xs text-texto-secundario">
          {logoUrl ? 'Prévia de como o logo aparece no cabeçalho.' : 'Sem logo, o cabeçalho usa o ícone padrão do SOOL2.ai.'} Prefira uma imagem horizontal com fundo transparente; ela aparece com até 32 px de altura.
        </p>
      </Secao>

      <Secao
        titulo="Parâmetros de mistura"
        descricao="Percentuais obrigatórios usados pela IA nas respostas. Mudam por decisão do CNPE, então mantenha-os atualizados."
        acao={
          <button
            className="botao-secundario"
            onClick={() => setParametros((l) => [...l, { id: -Date.now(), produto_final: '', componente: '', percentual: 0, referencia: '', vigencia_inicio: null }])}
          >
            <Plus size={16} /> Adicionar
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-texto-secundario">
                <th className="pb-2 pr-3 font-medium">Produto final</th>
                <th className="pb-2 pr-3 font-medium">Componente</th>
                <th className="w-24 pb-2 pr-3 font-medium">%</th>
                <th className="pb-2 pr-3 font-medium">Referência</th>
                <th className="w-40 pb-2 pr-3 font-medium">Vigência</th>
                <th className="w-10 pb-2" />
              </tr>
            </thead>
            <tbody>
              {parametros.map((p, i) => (
                <tr key={p.id}>
                  <td className="py-1 pr-3"><input className="campo h-9" value={p.produto_final} onChange={(e) => mudarParametro(i, 'produto_final', e.target.value)} aria-label="Produto final" /></td>
                  <td className="py-1 pr-3"><input className="campo h-9" value={p.componente} onChange={(e) => mudarParametro(i, 'componente', e.target.value)} aria-label="Componente" /></td>
                  <td className="py-1 pr-3"><input className="campo h-9 text-right" inputMode="decimal" value={String(p.percentual)} onChange={(e) => mudarParametro(i, 'percentual', e.target.value)} aria-label="Percentual" /></td>
                  <td className="py-1 pr-3"><input className="campo h-9" value={p.referencia ?? ''} onChange={(e) => mudarParametro(i, 'referencia', e.target.value)} aria-label="Referência" /></td>
                  <td className="py-1 pr-3"><input type="date" className="campo h-9" value={p.vigencia_inicio ?? ''} onChange={(e) => mudarParametro(i, 'vigencia_inicio', e.target.value)} aria-label="Início da vigência" /></td>
                  <td className="py-1">
                    <button className="botao-icone" onClick={() => void removerParametro(p)} aria-label="Remover parâmetro"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="botao-acao-rotulo" onClick={() => void salvarParametros()}>Salvar parâmetros</button>
        </div>
      </Secao>

      <Secao titulo="Perfil" descricao="Seu nome aparece na coluna “Incluído por” dos cenários.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-80">
            <label className="rotulo" htmlFor="perfil-nome">Nome</label>
            <input id="perfil-nome" className="campo" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <button className="botao-secundario" onClick={() => void salvarPerfil()}>Salvar nome</button>
          <p className="w-full text-sm text-texto-secundario">
            {loginSool
              ? `Usuário SOOL: ${(sessao?.user.user_metadata as { sool_id?: string } | undefined)?.sool_id ?? ''}. O nome é atualizado a partir do cadastro do SOOL a cada entrada.`
              : `E-mail: ${perfil?.email ?? ''}`}
          </p>
        </div>
      </Secao>

      {loginSool ? (
        <Secao titulo="Senha" descricao="Seu acesso usa o usuário e a senha do SOOL.">
          <p className="text-sm">A senha é conferida diretamente no cadastro do SOOL a cada entrada. Para trocá-la, altere-a na aplicação SOOL.</p>
        </Secao>
      ) : (
        <Secao titulo="Senha" descricao="Troque a senha usada para entrar no SOOL2.ai. Por segurança, confirme a senha atual.">
          <form onSubmit={trocarSenha} className="grid gap-4 sm:grid-cols-3">
            <input type="email" name="username" autoComplete="username" value={sessao?.user.email ?? ''} readOnly hidden />
            <div>
              <label className="rotulo" htmlFor="senha-atual">Senha atual</label>
              <input
                id="senha-atual"
                name="current-password"
                type={verSenhas ? 'text' : 'password'}
                autoComplete="current-password"
                className="campo"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="senha-nova">Nova senha</label>
              <input
                id="senha-nova"
                name="new-password"
                type={verSenhas ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={SENHA_MINIMA}
                className="campo"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="senha-confirmacao">Confirmar nova senha</label>
              <input
                id="senha-confirmacao"
                name="confirm-password"
                type={verSenhas ? 'text' : 'password'}
                autoComplete="new-password"
                className="campo"
                value={confirmacaoSenha}
                onChange={(e) => setConfirmacaoSenha(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
              <button type="button" className="inline-flex items-center gap-2 text-sm text-texto-verde hover:underline" onClick={() => setVerSenhas((v) => !v)} aria-pressed={verSenhas}>
                {verSenhas ? <EyeOff size={16} /> : <Eye size={16} />}
                {verSenhas ? 'Ocultar senhas' : 'Mostrar senhas'}
              </button>
              <span className="text-xs text-texto-secundario">Mínimo de {SENHA_MINIMA} caracteres.</span>
              <button type="submit" className="botao-secundario ml-auto" disabled={trocandoSenha}>
                {trocandoSenha && <Loader2 size={15} className="animate-spin" />}
                {trocandoSenha ? 'Alterando…' : 'Alterar senha'}
              </button>
            </div>
            {erroSenha && <p className="text-sm text-erro sm:col-span-3">{erroSenha}</p>}
          </form>
        </Secao>
      )}

      <Dialogo
        aberto={Boolean(form)}
        titulo={form?.id ? 'Editar plataforma de IA' : 'Nova plataforma de IA'}
        aoFechar={() => setForm(null)}
        rodape={
          <>
            <button className="botao-secundario" onClick={() => setForm(null)}>Cancelar</button>
            <button className="botao-acao-rotulo" type="submit" form="form-ia" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </>
        }
      >
        {form && (
          <form id="form-ia" onSubmit={salvar} autoComplete="off" className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="ia-nome">Nome da configuração</label>
              <input id="ia-nome" name="ia-config-nome" autoComplete="off" {...SEM_AUTOPREENCHER} className="campo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Claude da equipe" />
            </div>
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="ia-provedor">Plataforma</label>
              <select id="ia-provedor" className="campo" value={form.provedor} onChange={(e) => setForm({ ...form, provedor: e.target.value as Provedor, modelo: '' })}>
                {PROVEDORES.map((p) => (
                  <option key={p.valor} value={p.valor}>{p.rotulo}</option>
                ))}
              </select>
            </div>
            {(form.provedor === 'azure_openai' || form.provedor === 'compativel_openai') && (
              <div className="sm:col-span-2">
                <label className="rotulo" htmlFor="ia-url">{form.provedor === 'azure_openai' ? 'Endpoint do Azure' : 'URL base da API'}</label>
                <input
                  id="ia-url"
                  name="ia-config-url"
                  autoComplete="off"
                  {...SEM_AUTOPREENCHER}
                  className="campo"
                  value={form.url_base}
                  onChange={(e) => setForm({ ...form, url_base: e.target.value })}
                  placeholder={form.provedor === 'azure_openai' ? 'https://seu-recurso.openai.azure.com' : 'https://openrouter.ai/api/v1'}
                />
                {form.provedor === 'compativel_openai' && (
                  <p className="mt-1 text-xs text-texto-secundario">A URL precisa ser acessível pela internet: as chamadas saem do Supabase, não do seu computador.</p>
                )}
              </div>
            )}
            {form.provedor === 'azure_openai' && (
              <>
                <div>
                  <label className="rotulo" htmlFor="ia-deploy">Nome do deployment</label>
                  <input id="ia-deploy" autoComplete="off" {...SEM_AUTOPREENCHER} className="campo" value={form.nome_deployment} onChange={(e) => setForm({ ...form, nome_deployment: e.target.value })} />
                </div>
                <div>
                  <label className="rotulo" htmlFor="ia-versao">Versão da API</label>
                  <input id="ia-versao" autoComplete="off" {...SEM_AUTOPREENCHER} className="campo" value={form.versao_api} onChange={(e) => setForm({ ...form, versao_api: e.target.value })} />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="ia-modelo">{form.provedor === 'azure_openai' ? 'Modelo (opcional)' : 'Modelo'}</label>
              <input
                id="ia-modelo"
                name="ia-config-modelo"
                autoComplete="off"
                {...SEM_AUTOPREENCHER}
                className="campo"
                list="sugestoes-modelo"
                value={form.modelo}
                onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                placeholder="Nome do modelo, como aparece na documentação da plataforma"
              />
              <datalist id="sugestoes-modelo">
                {(SUGESTOES[form.provedor] ?? []).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="ia-chave">Chave de API{form.provedor === 'compativel_openai' ? ' (opcional)' : ''}</label>
              <div className="relative">
                <input
                  id="ia-chave"
                  name="ia-config-chave-api"
                  type={verChave ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  {...SEM_AUTOPREENCHER}
                  className="campo pr-11 font-mono"
                  value={form.chave}
                  onChange={(e) => setForm({ ...form, chave: e.target.value })}
                  placeholder={form.mascara ? `Chave atual ${form.mascara}. Deixe em branco para manter.` : 'Cole a chave aqui'}
                />
                <button
                  type="button"
                  className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-texto-secundario hover:bg-[#F3F4F6] hover:text-texto-forte"
                  onClick={() => setVerChave((v) => !v)}
                  aria-label={verChave ? 'Ocultar chave' : 'Mostrar chave'}
                  title={verChave ? 'Ocultar chave' : 'Mostrar chave'}
                  aria-pressed={verChave}
                >
                  {verChave ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <p className="mt-1 text-xs text-texto-secundario">
                {form.mascara
                  ? 'Por segurança, a chave salva não pode ser exibida (só o final aparece acima). Para trocar, cole a nova chave.'
                  : 'Use o ícone do olho para conferir a chave antes de salvar.'}
              </p>
            </div>
            <div>
              <label className="rotulo" htmlFor="ia-temp">Temperatura</label>
              <input id="ia-temp" autoComplete="off" {...SEM_AUTOPREENCHER} className="campo" inputMode="decimal" value={form.temperatura} onChange={(e) => setForm({ ...form, temperatura: e.target.value })} placeholder="Padrão do modelo" />
              <p className="mt-1 text-xs text-texto-secundario">Deixe em branco: modelos recentes não aceitam outro valor.</p>
            </div>
            <div>
              <label className="rotulo" htmlFor="ia-tokens">Limite de tokens por resposta</label>
              <input id="ia-tokens" autoComplete="off" {...SEM_AUTOPREENCHER} className="campo" inputMode="numeric" value={form.limite_tokens} onChange={(e) => setForm({ ...form, limite_tokens: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-texto-forte sm:col-span-2">
              <input type="checkbox" className="h-4 w-4 accent-[#2E7D32]" checked={form.padrao} onChange={(e) => setForm({ ...form, padrao: e.target.checked })} />
              Usar como padrão nas perguntas
            </label>
            {erroForm && <p className="text-sm text-erro sm:col-span-2">{erroForm}</p>}
          </form>
        )}
      </Dialogo>

      <DialogoConfirmacao
        aberto={Boolean(paraExcluir)}
        titulo="Excluir configuração"
        perigo
        mensagem={paraExcluir && <p>A configuração “{paraExcluir.nome}” e a chave guardada serão removidas.</p>}
        rotuloConfirmar="Excluir"
        aoCancelar={() => setParaExcluir(null)}
        aoConfirmar={() => void excluir()}
      />
    </div>
  )
}
