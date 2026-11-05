import { Moon, Sun } from 'lucide-react'
import { useTema } from '../lib/tema'

/** Alterna entre fundo branco e fundo preto. */
export function BotaoTema({ className = '' }: { className?: string }) {
  const { tema, alternarTema } = useTema()
  const escuro = tema === 'escuro'
  const rotulo = escuro ? 'Usar fundo branco' : 'Usar fundo preto'
  return (
    <button className={`botao-icone ${className}`} onClick={alternarTema} aria-label={rotulo} title={rotulo} aria-pressed={escuro}>
      {escuro ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
