import { Link } from 'react-router-dom'
import { Layers, LayoutDashboard, MessageSquareText, Settings, type LucideIcon } from 'lucide-react'
import { useSessao } from '../lib/sessao'

const ATALHOS: { para: string; rotulo: string; descricao: string; icone: LucideIcon }[] = [
  { para: '/dashboards', rotulo: 'Dashboards', descricao: 'Compare custos, volumes e atendimento entre cenários e estudos.', icone: LayoutDashboard },
  { para: '/cenarios', rotulo: 'Cenários', descricao: 'Inclua, atualize e consulte os arquivos XML do otimizador.', icone: Layers },
  { para: '/perguntas', rotulo: 'Perguntas', descricao: 'Pergunte em português sobre os dados dos cenários.', icone: MessageSquareText },
  { para: '/configuracoes', rotulo: 'Configurações', descricao: 'Plataforma de IA, marca e parâmetros do aplicativo.', icone: Settings },
]

/** Tela inicial: nenhuma opção é aberta automaticamente; o usuário escolhe no menu ou nos atalhos. */
export function Inicio() {
  const { perfil } = useSessao()
  const primeiroNome = perfil?.nome?.trim().split(/\s+/)[0]
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-10">
      <h1 className="titulo-pagina">{primeiroNome ? `Olá, ${primeiroNome}` : 'Bem-vindo'}</h1>
      <p className="subtitulo-pagina">Escolha uma opção no menu ou nos atalhos abaixo.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {ATALHOS.map(({ para, rotulo, descricao, icone: Icone }) => (
          <Link key={para} to={para} className="cartao flex items-start gap-4 p-5 transition hover:border-primaria-escura hover:shadow-suave">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EEF6EF] text-texto-verde">
              <Icone size={19} />
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-texto-forte">{rotulo}</span>
              <span className="mt-0.5 block text-sm text-texto-secundario">{descricao}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
