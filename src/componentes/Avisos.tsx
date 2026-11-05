import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'

type Tipo = 'sucesso' | 'erro'
interface Aviso {
  id: number
  tipo: Tipo
  texto: string
}

const Contexto = createContext<(texto: string, tipo?: Tipo) => void>(() => {})

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const remover = (id: number) => setAvisos((a) => a.filter((x) => x.id !== id))
  const avisar = useCallback((texto: string, tipo: Tipo = 'sucesso') => {
    const id = Date.now() + Math.random()
    setAvisos((a) => [...a, { id, tipo, texto }])
    setTimeout(() => remover(id), tipo === 'erro' ? 8000 : 4000)
  }, [])
  return (
    <Contexto.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-[4.25rem] z-[60] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2 sm:left-auto sm:right-4 sm:translate-x-0" aria-live="polite">
        {avisos.slice(-3).map((a) => (
          <div key={a.id} className="pointer-events-auto flex items-start gap-3 rounded-lg bg-[#323232] px-4 py-3 text-sm text-white shadow-lg">
            {a.tipo === 'erro' ? <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#ff8a80]" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-primaria-clara" />}
            <span className="flex-1">{a.texto}</span>
            <button onClick={() => remover(a.id)} aria-label="Fechar aviso" className="text-white/70 hover:text-white">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  )
}

export const useAvisos = () => useContext(Contexto)
