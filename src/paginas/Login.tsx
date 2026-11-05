import { useState, type FormEvent } from 'react'
import { Check, Eye, EyeOff, Fuel, Loader2 } from 'lucide-react'
import { chamarFuncao, supabase } from '../lib/supabase'
import { BotaoTema } from '../componentes/BotaoTema'

const DESTAQUES = ['Cenários do otimizador em um só lugar', 'Perguntas em português, respondidas por IA', 'Tabelas, gráficos e dashboards exportáveis']

function Marca() {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primaria-escura text-white" aria-hidden>
        <Fuel size={19} />
      </span>
      <span className="text-xl font-semibold tracking-tight text-texto-forte">
        Demo.SOOL2<span className="text-texto-verde">.ai</span>
      </span>
    </div>
  )
}

/**
 * Login com o usuário e a senha do SOOL. A conferência é feita no servidor (Edge Function entrar-sool),
 * na tabela Usuario do SQL Server, com o mesmo critério da aplicação SOOL (SOOL2COM = 1).
 */
export function Login() {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const r = await chamarFuncao<{ token_hash?: string }>('entrar-sool', { usuario: usuario.trim(), senha })
      if (!r.ok || !r.token_hash) throw new Error(r.erro ?? 'Não foi possível entrar.')
      const { error } = await supabase.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' })
      if (error) throw new Error(`Não foi possível abrir a sessão: ${error.message}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="relative flex min-h-full bg-white">
      <BotaoTema className="absolute right-4 top-4 z-10" />
      <aside className="relative hidden w-[46%] max-w-xl flex-col justify-between overflow-hidden border-r border-divisor bg-[#F5FAF6] p-12 lg:flex">
        <div className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[#E6F2E8]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-[#EDF6EE]" aria-hidden />
        <div className="relative">
          <Marca />
        </div>
        <div className="relative">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-texto-forte">Logística de Comercialização de Combustíveis</h2>
          <p className="mt-3 max-w-md text-texto">Importe os cenários do otimizador e faça perguntas sobre eles. A IA responde com texto, tabelas, gráficos e dashboards.</p>
          <ul className="mt-8 space-y-3 text-sm text-texto-forte">
            {DESTAQUES.map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-texto-verde shadow-suave">
                  <Check size={14} strokeWidth={2.5} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-texto-secundario">Acesso com o usuário e a senha do SOOL.</p>
      </aside>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Marca />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-texto-forte">Entrar</h1>
          <p className="mt-1 text-sm text-texto-secundario">Use o mesmo usuário e senha do SOOL.</p>

          <form onSubmit={enviar} className="mt-8 space-y-5">
            <div>
              <label className="rotulo" htmlFor="usuario">Usuário</label>
              <input
                id="usuario"
                name="username"
                className="campo h-11"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="senha">Senha</label>
              <div className="relative">
                <input
                  id="senha"
                  name="password"
                  type={verSenha ? 'text' : 'password'}
                  className="campo h-11 pr-11"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-texto-secundario hover:bg-[#F3F4F6] hover:text-texto-forte"
                  onClick={() => setVerSenha((v) => !v)}
                  aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  title={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={verSenha}
                >
                  {verSenha ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            {erro && <p className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-sm text-erro">{erro}</p>}
            <button type="submit" className="botao-acao-rotulo h-11 w-full" disabled={enviando}>
              {enviando && <Loader2 size={16} className="animate-spin" />}
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          <p className="mt-10 text-center text-xs text-placeholder">Demo.SOOL2.ai · Logística de Comercialização de Combustíveis</p>
        </div>
      </main>
    </div>
  )
}
