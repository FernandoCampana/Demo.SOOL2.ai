import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

export interface OpcaoSeletor {
  id: string
  rotulo: string
  /** Agrupa as opções (ex.: estudo do cenário); o grupo inteiro pode ser marcado de uma vez. */
  grupo?: string
}

const SEM_GRUPO_ULTIMO = 'Sem estudo'

/** Lista suspensa com caixas de seleção, busca opcional e marcação de grupos inteiros. Nada marcado = todos. */
export function SeletorMultiplo({
  rotulo,
  todos,
  opcoes,
  selecionados,
  aoMudar,
  busca = false,
}: {
  rotulo: string
  todos: string
  opcoes: OpcaoSeletor[]
  selecionados: string[]
  aoMudar: (ids: string[]) => void
  busca?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => caixa.current && !caixa.current.contains(e.target as Node) && setAberto(false)
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  const grupos = useMemo(() => {
    const t = termo.trim().toLowerCase()
    const mapa = new Map<string, OpcaoSeletor[]>()
    for (const o of opcoes) {
      const g = o.grupo ?? ''
      if (t && !o.rotulo.toLowerCase().includes(t) && !g.toLowerCase().includes(t)) continue
      mapa.set(g, [...(mapa.get(g) ?? []), o])
    }
    return [...mapa.entries()].sort(([a], [b]) => (a === SEM_GRUPO_ULTIMO ? 1 : b === SEM_GRUPO_ULTIMO ? -1 : a.localeCompare(b, 'pt-BR')))
  }, [opcoes, termo])

  const resumo =
    selecionados.length === 0
      ? todos
      : selecionados.length === 1
        ? opcoes.find((o) => o.id === selecionados[0])?.rotulo ?? '1 selecionado'
        : `${selecionados.length} selecionados`
  const alternar = (id: string) => aoMudar(selecionados.includes(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id])
  const alternarGrupo = (ids: string[]) => {
    const tudo = ids.every((id) => selecionados.includes(id))
    aoMudar(tudo ? selecionados.filter((id) => !ids.includes(id)) : [...new Set([...selecionados, ...ids])])
  }

  return (
    <div className="relative min-w-0" ref={caixa}>
      <button
        type="button"
        className={`botao-secundario h-9 max-w-[16rem] justify-between gap-1.5 px-3 ${selecionados.length ? 'border-primaria-escura' : ''}`}
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        title={`${rotulo}: ${resumo}`}
      >
        <span className="truncate">
          <span className="text-texto-secundario">{rotulo}:</span> {resumo}
        </span>
        <ChevronDown size={15} className="shrink-0" />
      </button>
      {aberto && (
        <div className="absolute left-0 z-30 mt-1 w-80 max-w-[90vw] rounded-lg border border-divisor bg-white py-1 shadow-elevada">
          {busca && (
            <div className="px-3 pb-1 pt-2">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-placeholder" />
                <input className="campo h-8 pl-8" placeholder="Buscar" value={termo} onChange={(e) => setTermo(e.target.value)} aria-label={`Buscar em ${rotulo}`} autoFocus />
              </div>
            </div>
          )}
          <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-black/5" onClick={() => aoMudar([])}>
            <span className="flex h-4 w-4 items-center justify-center">{selecionados.length === 0 && <Check size={16} className="text-texto-verde" />}</span>
            {todos}
          </button>
          <div className="my-1 border-t border-divisor" />
          <div className="max-h-80 overflow-auto">
            {grupos.length === 0 && <p className="px-4 py-3 text-sm text-texto-secundario">Nada encontrado.</p>}
            {grupos.map(([grupo, lista]) => {
              const ids = lista.map((o) => o.id)
              const tudo = ids.every((id) => selecionados.includes(id))
              const parte = !tudo && ids.some((id) => selecionados.includes(id))
              return (
                <div key={grupo || '_'} className="py-1">
                  {grupo && (
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-texto-secundario hover:bg-black/5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#2E7D32]"
                        checked={tudo}
                        ref={(el) => {
                          if (el) el.indeterminate = parte
                        }}
                        onChange={() => alternarGrupo(ids)}
                        aria-label={`Selecionar todos de ${grupo}`}
                      />
                      <span className="truncate">{grupo}</span>
                      <span className="ml-auto font-normal normal-case tracking-normal">{lista.length}</span>
                    </label>
                  )}
                  {lista.map((o) => (
                    <label key={o.id} className={`flex cursor-pointer items-center gap-3 py-1.5 pr-4 text-sm hover:bg-black/5 ${grupo ? 'pl-10' : 'pl-4'}`}>
                      <input type="checkbox" className="h-4 w-4 accent-[#2E7D32]" checked={selecionados.includes(o.id)} onChange={() => alternar(o.id)} />
                      <span className="truncate text-texto-forte">{o.rotulo}</span>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
