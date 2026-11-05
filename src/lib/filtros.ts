import { useEffect, useState } from 'react'

const PREFIXO = 'sool2.filtros.'

function ler<T>(chave: string, inicial: T): T {
  try {
    // Filtros comuns (Dashboards e Perguntas) usam a mesma chave; aproveita o valor gravado antes da unificação
    const bruto =
      localStorage.getItem(PREFIXO + chave) ??
      (chave.startsWith('comum.') ? localStorage.getItem(`${PREFIXO}dashboards.${chave.slice(6)}`) : null)
    if (bruto === null) return inicial
    const valor = JSON.parse(bruto) as unknown
    // Só aceita o valor gravado se tiver o mesmo formato do inicial (lista ou texto)
    if (Array.isArray(inicial)) return (Array.isArray(valor) && valor.every((v) => typeof v === 'string') ? valor : inicial) as T
    return (typeof valor === typeof inicial ? valor : inicial) as T
  } catch {
    return inicial
  }
}

/** Estado de filtro que fica gravado no navegador: mantido ao trocar de opção e ao recarregar, até o usuário alterar. */
export function useFiltroPersistente<T extends string | string[]>(chave: string, inicial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [valor, setValor] = useState<T>(() => ler(chave, inicial))
  useEffect(() => {
    try {
      localStorage.setItem(PREFIXO + chave, JSON.stringify(valor))
    } catch {
      // armazenamento indisponível: o filtro vale só enquanto a página estiver aberta
    }
  }, [chave, valor])
  return [valor, setValor]
}
