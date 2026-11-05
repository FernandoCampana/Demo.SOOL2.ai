import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface Perfil {
  id: string
  nome: string
  email: string
}

interface ContextoSessao {
  sessao: Session | null
  perfil: Perfil | null
  carregando: boolean
  recarregarPerfil: () => Promise<void>
  sair: () => Promise<void>
}

const Contexto = createContext<ContextoSessao | null>(null)

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)

  const carregarPerfil = useCallback(async (s: Session | null) => {
    if (!s) {
      setPerfil(null)
      return
    }
    const { data } = await supabase.from('perfis').select('id, nome, email').eq('id', s.user.id).maybeSingle()
    setPerfil(data ?? { id: s.user.id, nome: s.user.email?.split('@')[0] ?? 'Usuário', email: s.user.email ?? '' })
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSessao(data.session)
      await carregarPerfil(data.session)
      setCarregando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s)
      void carregarPerfil(s)
    })
    return () => data.subscription.unsubscribe()
  }, [carregarPerfil])

  const valor: ContextoSessao = {
    sessao,
    perfil,
    carregando,
    recarregarPerfil: () => carregarPerfil(sessao),
    sair: async () => {
      await supabase.auth.signOut()
    },
  }
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSessao(): ContextoSessao {
  const c = useContext(Contexto)
  if (!c) throw new Error('useSessao fora do ProvedorSessao')
  return c
}
