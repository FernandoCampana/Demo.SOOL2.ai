import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  aberto: boolean
  titulo: string
  aoFechar?: () => void
  children: ReactNode
  rodape?: ReactNode
  largura?: 'pequena' | 'media' | 'grande' | 'tela'
}

const LARGURAS = {
  pequena: 'max-w-md',
  media: 'max-w-xl',
  grande: 'max-w-3xl',
  tela: 'max-w-none h-full sm:h-[calc(100%-2rem)]',
}

export function Dialogo({ aberto, titulo, aoFechar, children, rodape, largura = 'media' }: Props) {
  const painel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const anterior = document.activeElement as HTMLElement | null
    const foco = painel.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-fechar])')
    ;(foco ?? painel.current)?.focus()
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && aoFechar) aoFechar()
    }
    document.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = ''
      anterior?.focus()
    }
  }, [aberto, aoFechar])

  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && aoFechar?.()}>
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:rounded-xl ${LARGURAS[largura]}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-divisor px-5 py-4">
          <h2 className="text-lg font-medium text-texto-forte">{titulo}</h2>
          {aoFechar && (
            <button data-fechar className="botao-icone" onClick={aoFechar} aria-label="Fechar">
              <X size={20} />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4 text-sm leading-relaxed">{children}</div>
        {rodape && <div className="flex flex-wrap justify-end gap-2 border-t border-divisor px-5 py-3">{rodape}</div>}
      </div>
    </div>
  )
}

interface Confirmacao {
  aberto: boolean
  titulo: string
  mensagem: ReactNode
  rotuloConfirmar: string
  perigo?: boolean
  aoConfirmar: () => void
  aoCancelar: () => void
}

export function DialogoConfirmacao({ aberto, titulo, mensagem, rotuloConfirmar, perigo, aoConfirmar, aoCancelar }: Confirmacao) {
  return (
    <Dialogo
      aberto={aberto}
      titulo={titulo}
      aoFechar={aoCancelar}
      largura="pequena"
      rodape={
        <>
          <button className="botao-secundario" onClick={aoCancelar}>
            Cancelar
          </button>
          <button className={perigo ? 'botao-perigo' : 'botao-acao-rotulo'} onClick={aoConfirmar}>
            {rotuloConfirmar}
          </button>
        </>
      }
    >
      {mensagem}
    </Dialogo>
  )
}
