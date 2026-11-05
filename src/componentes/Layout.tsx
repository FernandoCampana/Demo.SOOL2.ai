import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Fuel, Layers, LayoutDashboard, LogOut, Menu, MessageSquareText, PanelLeftClose, PanelLeftOpen, Settings, X } from 'lucide-react'
import { useSessao } from '../lib/sessao'
import { useMarca } from '../lib/marca'
import { BotaoTema } from './BotaoTema'

const ITENS = [
  { para: '/dashboards', rotulo: 'Dashboards', icone: LayoutDashboard },
  { para: '/cenarios', rotulo: 'Cenários', icone: Layers },
  { para: '/perguntas', rotulo: 'Perguntas', icone: MessageSquareText },
  { para: '/configuracoes', rotulo: 'Configurações', icone: Settings },
]

const SUBTITULO = 'Logística de Comercialização de Combustíveis'

/** Logo configurado em Configurações ou, sem ele, a marca padrão do SOOL2.ai. No fundo preto o logo ganha um fundo branco. */
function Marca({ url }: { url: string | null }) {
  if (url) return <img src={url} alt="Logo" className="h-8 w-auto max-w-[8rem] shrink-0 object-contain dark:rounded-md dark:bg-white dark:px-1.5 dark:py-1" />
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primaria-escura text-white" aria-hidden>
      <Fuel size={17} />
    </span>
  )
}

/** Nome SOOL2.ai numa caixa verde, no mesmo tom dos botões principais. */
function Nome() {
  return (
    <span className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg bg-acao px-3 text-base font-semibold tracking-tight text-white shadow-suave">
      Demo.SOOL2.ai
    </span>
  )
}

function iniciaisDe(nome?: string | null): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  const ini = (partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')
  return ini.toUpperCase() || '?'
}

export function Layout() {
  const { perfil, sair } = useSessao()
  const { logoUrl } = useMarca()
  const [gaveta, setGaveta] = useState(false)
  const [recolhido, setRecolhido] = useState(false)
  const local = useLocation()

  useEffect(() => setGaveta(false), [local.pathname])

  const navegacao = (compacto: boolean) => (
    <nav aria-label="Menu principal" className="flex flex-col gap-0.5 px-3">
      {ITENS.map(({ para, rotulo, icone: Icone }) => (
        <NavLink
          key={para}
          to={para}
          title={compacto ? rotulo : undefined}
          className={({ isActive }) =>
            `flex h-10 items-center gap-3 rounded-lg text-sm transition ${compacto ? 'justify-center' : 'px-3'} ${
              isActive ? 'bg-[#EEF6EF] font-medium text-texto-verde' : 'text-texto hover:bg-[#F3F4F6] hover:text-texto-forte'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icone size={18} strokeWidth={isActive ? 2.2 : 1.8} />
              {!compacto && <span>{rotulo}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="flex h-full flex-col bg-fundo">
      <header
        className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-divisor bg-white px-3 sm:px-4"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', boxSizing: 'content-box' }}
      >
        <button className="botao-icone md:hidden" onClick={() => setGaveta(true)} aria-label="Abrir menu">
          <Menu size={20} />
        </button>
        <button className="botao-icone hidden md:inline-flex" onClick={() => setRecolhido((r) => !r)} aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}>
          {recolhido ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <div className="ml-1 flex min-w-0 items-center gap-3">
          <Marca url={logoUrl} />
          <Nome />
          <span className="hidden h-5 w-px shrink-0 bg-borda lg:block" aria-hidden />
          <span className="hidden truncate text-sm text-texto-secundario lg:inline">{SUBTITULO}</span>
        </div>
        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          <BotaoTema />
          <div className="hidden items-center gap-2.5 sm:flex" title={perfil?.email}>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF6EF] text-xs font-semibold text-texto-verde">
              {iniciaisDe(perfil?.nome)}
            </span>
            <span className="max-w-[12rem] truncate text-sm font-medium text-texto-forte">{perfil?.nome}</span>
          </div>
          <span className="hidden h-5 w-px bg-borda sm:block" aria-hidden />
          <button className="botao-icone" onClick={() => void sair()} aria-label="Sair" title="Sair">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className={`hidden shrink-0 border-r border-divisor bg-white py-5 transition-[width] md:block ${recolhido ? 'w-[4.5rem]' : 'w-60'}`}>
          {!recolhido && <p className="px-6 pb-2 text-[11px] font-semibold uppercase tracking-wider text-placeholder">Navegação</p>}
          {navegacao(recolhido)}
        </aside>

        {gaveta && (
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setGaveta(false)}>
            <div className="absolute inset-0 bg-[#111827]/30 backdrop-blur-[1px]" />
            <aside
              className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-elevada"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-16 items-center gap-3 border-b border-divisor px-4">
                <Marca url={logoUrl} />
                <Nome />
                <button className="botao-icone ml-auto" onClick={() => setGaveta(false)} aria-label="Fechar menu">
                  <X size={18} />
                </button>
              </div>
              <p className="px-4 pb-1 pt-4 text-xs text-texto-secundario">{SUBTITULO}</p>
              <div className="py-3">{navegacao(false)}</div>
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
