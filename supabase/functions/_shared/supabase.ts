import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.117.2'
import { ErroHttp } from './cors.ts'
import type { ConfigIA } from './provedores.ts'

/**
 * Lê uma chave do ambiente das Edge Functions.
 * Projetos novos usam SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS (JSON com a chave "default");
 * projetos antigos usam SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY. As duas formas funcionam.
 */
export function chaveDoAmbiente(nova: string, legada: string): string {
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
  const valorLegado = Deno.env.get(legada)
  if (valorLegado) return valorLegado
  throw new ErroHttp(500, `As variáveis ${nova} e ${legada} não estão disponíveis na Edge Function.`)
}

export interface Clientes {
  /** Cliente com a sessão do usuário (RLS aplicado). */
  usuario: SupabaseClient
  /** Token de acesso do usuário que chamou a função. */
  token: string
}

export function criarClientes(req: Request): Clientes {
  const url = Deno.env.get('SUPABASE_URL')!
  const publica = chaveDoAmbiente('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
  const authorization = req.headers.get('Authorization') ?? ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token || token.startsWith('sb_')) throw new ErroHttp(401, 'Sessão expirada. Entre novamente.')
  return {
    usuario: createClient(url, publica, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }),
    token,
  }
}

/** Valida o token do usuário no Supabase Auth (verify_jwt fica desligado; a autorização é feita aqui). */
export async function usuarioAtual(c: Clientes): Promise<User> {
  const { data, error } = await c.usuario.auth.getUser(c.token)
  if (error || !data.user) throw new ErroHttp(401, 'Sessão expirada. Entre novamente.')
  return data.user
}

/**
 * Chama uma função do banco com a chave secreta (service_role).
 * Chaves novas (sb_secret_...) vão só no cabeçalho apikey; a chave legada vai também como Bearer.
 */
async function rpcAdmin<T>(nome: string, argumentos: Record<string, unknown>): Promise<T> {
  const url = Deno.env.get('SUPABASE_URL')!
  const secreta = chaveDoAmbiente('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  const cabecalhos: Record<string, string> = { apikey: secreta, 'Content-Type': 'application/json' }
  if (!secreta.startsWith('sb_')) cabecalhos.Authorization = `Bearer ${secreta}`
  const resp = await fetch(`${url}/rest/v1/rpc/${nome}`, { method: 'POST', headers: cabecalhos, body: JSON.stringify(argumentos) })
  const texto = await resp.text()
  if (!resp.ok) {
    let msg = texto
    try {
      msg = JSON.parse(texto).message ?? texto
    } catch { /* texto puro */ }
    throw new Error(msg)
  }
  return (texto ? JSON.parse(texto) : null) as T
}

export interface ConfigComId extends ConfigIA {
  id: string
  nome: string
  chave_api_secret_id: string | null
}

/** Carrega a configuração de IA (a indicada ou a padrão) do usuário e a chave guardada no Vault. */
export async function carregarConfiguracao(usuario: SupabaseClient, configuracaoId?: string | null): Promise<{ config: ConfigComId; chave: string | null }> {
  let consulta = usuario
    .from('configuracoes_ia')
    .select('id, nome, provedor, modelo, url_base, nome_deployment, versao_api, temperatura, limite_tokens, chave_api_secret_id')
  consulta = configuracaoId ? consulta.eq('id', configuracaoId) : consulta.eq('padrao', true)
  const { data, error } = await consulta.maybeSingle()
  if (error) throw new ErroHttp(500, `Não foi possível ler a configuração de IA: ${error.message}`)
  if (!data) {
    throw new ErroHttp(400, configuracaoId
      ? 'Configuração de IA não encontrada.'
      : 'Nenhuma plataforma de IA padrão configurada. Cadastre uma em Configurações.')
  }
  const config = data as ConfigComId
  let chave: string | null = null
  if (config.chave_api_secret_id) {
    try {
      chave = await rpcAdmin<string | null>('ler_chave_ia', { p_config_id: config.id })
    } catch (e) {
      throw new ErroHttp(500, `Não foi possível ler a chave de API: ${e instanceof Error ? e.message : e}`)
    }
  }
  if (!chave && config.provedor !== 'compativel_openai') {
    throw new ErroHttp(400, `A configuração "${config.nome}" está sem chave de API. Informe a chave em Configurações.`)
  }
  return { config, chave }
}
