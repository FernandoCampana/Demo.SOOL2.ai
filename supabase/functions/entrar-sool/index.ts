// Edge Function "entrar-sool": valida usuário e senha na tabela Usuario do SQL Server do SOOL, com o mesmo
// critério da aplicação SOOL (Id + Senha + SOOL2COM = 1), e devolve um token de uso único para o navegador
// abrir a sessão no Supabase. verify_jwt fica desligado porque quem chama ainda não está autenticado.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { ConexaoSql, lerStringConexao, literal } from './tds.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

/** Chave do ambiente: formato novo (JSON com "default") ou variável legada. */
function chaveDoAmbiente(nova: string, legada: string): string {
  const json = Deno.env.get(nova)
  if (json) {
    try {
      const chaves = JSON.parse(json) as Record<string, string>
      const valor = chaves['default'] ?? Object.values(chaves)[0]
      if (valor) return valor
    } catch {
      if (json.startsWith('sb_')) return json
    }
  }
  const v = Deno.env.get(legada)
  if (v) return v
  throw new Error(`Variáveis ${nova}/${legada} indisponíveis.`)
}

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const SECRETA = chaveDoAmbiente('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
const admin = createClient(URL_SUPABASE, SECRETA, { auth: { persistSession: false, autoRefreshToken: false } })

/** Lê a string de conexão guardada no Vault (função ler_conexao_sool, só para service_role). */
let conexaoEmCache: string | null = null
async function lerConexao(): Promise<string> {
  if (conexaoEmCache) return conexaoEmCache
  const cab: Record<string, string> = { apikey: SECRETA, 'Content-Type': 'application/json' }
  if (!SECRETA.startsWith('sb_')) cab.Authorization = `Bearer ${SECRETA}`
  const r = await fetch(`${URL_SUPABASE}/rest/v1/rpc/ler_conexao_sool`, { method: 'POST', headers: cab, body: '{}' })
  const t = await r.text()
  if (!r.ok) throw new Error(`não foi possível ler a conexão do SQL Server (${t})`)
  const valor = JSON.parse(t) as string | null
  if (!valor) throw new Error('a conexão do SQL Server não está cadastrada no Vault (sool_sql_conexao)')
  conexaoEmCache = valor
  return valor
}

/** Literal varchar (a coluna Id é varchar, como o parâmetro @Id da aplicação SOOL). */
const literalVarchar = (t: string) => literal(t).slice(1)

async function hashCurto(texto: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(d)].slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** E-mail interno do usuário no Supabase: o próprio Id, se já for um e-mail; senão, um endereço derivado do Id. */
async function emailDoUsuario(id: string): Promise<string> {
  const t = id.trim().toLowerCase()
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) return t
  const slug = t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'usuario'
  return slug === t ? `${slug}@usuarios.sool2.ai` : `${slug}-${await hashCurto(t)}@usuarios.sool2.ai`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return responder({ ok: false, erro: 'Método não permitido.' }, 405)
  try {
    const corpo = (await req.json().catch(() => ({}))) as { usuario?: string; senha?: string }
    const usuario = String(corpo.usuario ?? '').trim()
    const senha = String(corpo.senha ?? '')
    if (!usuario || !senha) return responder({ ok: false, erro: 'Informe usuário e senha.' }, 400)
    if (usuario.length > 200 || senha.length > 200 || usuario.includes('\u0000') || senha.includes('\u0000')) {
      return responder({ ok: false, erro: 'Usuário ou senha incorretos.' }, 401)
    }

    let linhas: (string | number | null)[][]
    let banco: ConexaoSql | null = null
    try {
      banco = await ConexaoSql.abrir(lerStringConexao(await lerConexao()))
      linhas = await banco.consultar(
        'SET NOCOUNT ON; ' +
          'SELECT TOP 1 CAST(Id AS NVARCHAR(200)) AS Id, CAST(NomeCompleto AS NVARCHAR(400)) AS Nome, ' +
          'CAST(Administrador AS INT) AS Administrador, CAST(CodigoEmpresa AS INT) AS CodigoEmpresa ' +
          `FROM Usuario WHERE (Id = ${literalVarchar(usuario)} AND Senha = ${literal(senha)} AND SOOL2COM = 1)`,
      )
    } catch (e) {
      console.error('sqlserver', e)
      return responder({ ok: false, erro: `Não foi possível consultar o cadastro de usuários do SOOL: ${e instanceof Error ? e.message : String(e)}` }, 502)
    } finally {
      banco?.fechar()
    }

    const linha = linhas[0]
    if (!linha) {
      await esperar(700)
      return responder({ ok: false, erro: 'Usuário ou senha incorretos, ou usuário sem acesso ao SOOL2.ai.' }, 401)
    }

    const id = String(linha[0] ?? usuario).trim()
    const nome = String(linha[1] ?? '').trim() || id
    const ehAdmin = Number(linha[2] ?? 0) === 1
    const empresa = linha[3] === null ? null : Number(linha[3])

    const email = await emailDoUsuario(id)
    const metadados = { nome, sool_id: id, sool_admin: ehAdmin, sool_empresa: empresa }

    const criado = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: metadados, app_metadata: { login: 'sool' } })
    if (criado.error && !/already|registered|exists/i.test(criado.error.message)) throw criado.error

    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (link.error || !link.data?.properties?.hashed_token) throw link.error ?? new Error('não foi possível gerar a sessão')

    if (criado.error && link.data.user) {
      const u = link.data.user
      await admin.auth.admin.updateUserById(u.id, {
        user_metadata: { ...(u.user_metadata ?? {}), ...metadados },
        app_metadata: { ...(u.app_metadata ?? {}), login: 'sool' },
      })
      await admin.from('perfis').update({ nome }).eq('id', u.id)
    }

    return responder({ ok: true, email, token_hash: link.data.properties.hashed_token, nome })
  } catch (e) {
    console.error('entrar_sool', e)
    return responder({ ok: false, erro: `Não foi possível entrar: ${e instanceof Error ? e.message : String(e)}` }, 500)
  }
})
