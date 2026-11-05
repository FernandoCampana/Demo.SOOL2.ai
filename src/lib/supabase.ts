import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Indica se as variáveis de ambiente do Supabase foram preenchidas. */
export const supabaseConfigurado = Boolean(url && chave)

export const supabase = createClient(url || 'http://localhost:54321', chave || 'chave-nao-configurada', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Chama uma Edge Function e devolve o corpo JSON, inclusive quando a função responde com erro. */
export async function chamarFuncao<T>(nome: string, corpo: Record<string, unknown>): Promise<T & { ok: boolean; erro?: string }> {
  const { data, error } = await supabase.functions.invoke(nome, { body: corpo })
  if (error) {
    const contexto = (error as { context?: Response }).context
    if (contexto && typeof contexto.json === 'function') {
      try {
        return (await contexto.json()) as T & { ok: boolean; erro?: string }
      } catch {
        /* corpo não era JSON */
      }
    }
    return { ok: false, erro: error.message } as T & { ok: boolean; erro?: string }
  }
  return data as T & { ok: boolean; erro?: string }
}
