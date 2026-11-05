import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useSessao } from './sessao'

/** Bucket público do Supabase Storage onde fica o logo do aplicativo. */
export const BUCKET_LOGOS = 'logos'

interface ContextoMarca {
  logoUrl: string | null
  logoCaminho: string | null
  recarregarMarca: () => Promise<void>
}

const Contexto = createContext<ContextoMarca>({ logoUrl: null, logoCaminho: null, recarregarMarca: async () => {} })

export function urlDoLogo(caminho: string | null): string | null {
  return caminho ? supabase.storage.from(BUCKET_LOGOS).getPublicUrl(caminho).data.publicUrl : null
}

/** Carrega o logo configurado (único para todos os usuários) e o disponibiliza para o cabeçalho e as Configurações. */
export function ProvedorMarca({ children }: { children: ReactNode }) {
  const { sessao } = useSessao()
  const usuarioId = sessao?.user.id ?? null
  const [logoCaminho, setLogoCaminho] = useState<string | null>(null)

  const recarregarMarca = useCallback(async () => {
    const { data } = await supabase.from('configuracoes_app').select('logo_caminho').eq('id', 1).maybeSingle()
    setLogoCaminho((data?.logo_caminho as string | null | undefined) ?? null)
  }, [])

  useEffect(() => {
    if (usuarioId) void recarregarMarca()
    else setLogoCaminho(null)
  }, [usuarioId, recarregarMarca])

  return <Contexto.Provider value={{ logoUrl: urlDoLogo(logoCaminho), logoCaminho, recarregarMarca }}>{children}</Contexto.Provider>
}

export const useMarca = () => useContext(Contexto)
