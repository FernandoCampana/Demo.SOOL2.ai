import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface ItemMenu {
  rotulo: string
  icone?: ReactNode
  aoClicar: () => void
  desativado?: boolean
  dica?: string
  perigo?: boolean
}

interface Props {
  gatilho: (abrir: () => void, aberto: boolean) => ReactNode
  itens: ItemMenu[]
  alinhar?: 'esquerda' | 'direita'
}

/** Menu suspenso simples, acessível por teclado (Esc fecha). */
export function MenuOpcoes({ gatilho, itens, alinhar = 'direita' }: Props) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    caixa.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  return (
    <div className="relative" ref={caixa}>
      {gatilho(() => setAberto((a) => !a), aberto)}
      {aberto && (
        <div role="menu" className={`absolute z-40 mt-1 min-w-[12rem] rounded-lg border border-divisor bg-white py-1 shadow-lg ${alinhar === 'direita' ? 'right-0' : 'left-0'}`}>
          {itens.map((item) => (
            <button
              key={item.rotulo}
              role="menuitem"
              disabled={item.desativado}
              title={item.desativado ? item.dica : undefined}
              onClick={() => {
                setAberto(false)
                item.aoClicar()
              }}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-black/5 focus:bg-black/5 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${item.perigo ? 'text-erro' : 'text-texto-forte'}`}
            >
              {item.icone}
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
