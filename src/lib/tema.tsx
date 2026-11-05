import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/** Fundo da aplicação: branco (claro) ou preto (escuro). A escolha fica salva neste navegador. */
export type Tema = 'claro' | 'escuro'

const CHAVE = 'sool2ai.tema'

function lerTema(): Tema {
  try {
    return localStorage.getItem(CHAVE) === 'escuro' ? 'escuro' : 'claro'
  } catch {
    return 'claro'
  }
}

interface ContextoTema {
  tema: Tema
  definirTema: (t: Tema) => void
  alternarTema: () => void
}

const Contexto = createContext<ContextoTema>({ tema: 'claro', definirTema: () => {}, alternarTema: () => {} })

export function ProvedorTema({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(lerTema)

  useEffect(() => {
    const escuro = tema === 'escuro'
    document.documentElement.classList.toggle('dark', escuro)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#0a0d12' : '#ffffff')
    try {
      localStorage.setItem(CHAVE, tema)
    } catch {
      /* navegador sem armazenamento: vale só nesta visita */
    }
  }, [tema])

  const definirTema = useCallback((t: Tema) => setTema(t), [])
  const alternarTema = useCallback(() => setTema((t) => (t === 'escuro' ? 'claro' : 'escuro')), [])

  return <Contexto.Provider value={{ tema, definirTema, alternarTema }}>{children}</Contexto.Provider>
}

export const useTema = () => useContext(Contexto)
