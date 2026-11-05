import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { formatarValor, paraNumero, rotuloColuna } from '../lib/formatacao'
import type { LinhaDados } from '../lib/tipos'

interface Props {
  colunas: string[]
  linhas: LinhaDados[]
  maximo?: number
  alturaMaxima?: string
}

export function TabelaDados({ colunas, linhas, maximo = 500, alturaMaxima = '24rem' }: Props) {
  const [ordem, setOrdem] = useState<{ coluna: string; asc: boolean } | null>(null)

  const numericas = useMemo(() => {
    const s = new Set<string>()
    for (const c of colunas) {
      const valores = linhas.slice(0, 50).map((l) => l[c]).filter((v) => v !== null && v !== undefined)
      if (valores.length && valores.every((v) => paraNumero(v) !== null)) s.add(c)
    }
    return s
  }, [colunas, linhas])

  const ordenadas = useMemo(() => {
    if (!ordem) return linhas
    const { coluna, asc } = ordem
    return [...linhas].sort((a, b) => {
      const x = a[coluna]
      const y = b[coluna]
      if (x === y) return 0
      if (x === null || x === undefined) return 1
      if (y === null || y === undefined) return -1
      const nx = paraNumero(x)
      const ny = paraNumero(y)
      const r = nx !== null && ny !== null ? nx - ny : String(x).localeCompare(String(y), 'pt-BR')
      return asc ? r : -r
    })
  }, [linhas, ordem])

  if (!colunas.length) return <p className="text-sm text-texto-secundario">A consulta não retornou dados.</p>

  const visiveis = ordenadas.slice(0, maximo)
  return (
    <div>
      <div className="overflow-auto rounded-lg border border-divisor bg-white" style={{ maxHeight: alturaMaxima }}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              {colunas.map((c) => {
                const ativa = ordem?.coluna === c
                return (
                  <th key={c} scope="col" className={`border-b border-divisor px-3 py-2.5 font-medium text-texto-secundario ${numericas.has(c) ? 'text-right' : 'text-left'}`}>
                    <button
                      className="inline-flex items-center gap-1 whitespace-nowrap hover:text-texto-forte"
                      onClick={() => setOrdem(ativa ? { coluna: c, asc: !ordem!.asc } : { coluna: c, asc: true })}
                      aria-label={`Ordenar por ${rotuloColuna(c)}`}
                    >
                      {rotuloColuna(c)}
                      {ativa && (ordem!.asc ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l, i) => (
              <tr key={i} className="border-b border-divisor last:border-0 hover:bg-fundo">
                {colunas.map((c) => (
                  <td key={c} className={`px-3 py-2 text-texto ${numericas.has(c) ? 'text-right tabular-nums' : ''} whitespace-nowrap`}>
                    {formatarValor(l[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-xs text-texto-secundario">
        {linhas.length > maximo ? `Mostrando ${maximo} de ${linhas.length.toLocaleString('pt-BR')} linhas. A exportação inclui todas.` : `${linhas.length.toLocaleString('pt-BR')} linha(s).`}
      </p>
    </div>
  )
}
