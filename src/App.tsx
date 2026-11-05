import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProvedorSessao, useSessao } from './lib/sessao'
import { ProvedorMarca } from './lib/marca'
import { ProvedorTema } from './lib/tema'
import { supabaseConfigurado } from './lib/supabase'
import { ProvedorAvisos } from './componentes/Avisos'
import { Layout } from './componentes/Layout'
import { Login } from './paginas/Login'
import { Cenarios } from './paginas/Cenarios'
import { Perguntas } from './paginas/Perguntas'
import { Configuracoes } from './paginas/Configuracoes'
import { Dashboards } from './paginas/Dashboards'
import { Inicio } from './paginas/Inicio'

function Rotas() {
  const { sessao, carregando } = useSessao()
  if (carregando) return <div className="flex h-full items-center justify-center text-sm text-texto-secundario">Carregando…</div>
  if (!sessao) return <Login />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="/cenarios" element={<Cenarios />} />
        <Route path="/perguntas" element={<Perguntas />} />
        <Route path="/dashboards" element={<Dashboards />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function FaltaConfiguracao() {
  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-medium text-primaria-escura">Demo.SOOL2.ai</h1>
      <p className="mt-4 text-texto-forte">Falta conectar o aplicativo ao Supabase.</p>
      <p className="mt-2 text-sm">
        Copie o arquivo <code>.env.example</code> para <code>.env.local</code>, preencha <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> com os dados do seu projeto
        (Project Settings, API) e reinicie o servidor. O passo a passo completo está no README.
      </p>
    </div>
  )
}

export default function App() {
  return (
    <ProvedorTema>
      {supabaseConfigurado ? (
        <BrowserRouter>
          <ProvedorAvisos>
            <ProvedorSessao>
              <ProvedorMarca>
                <Rotas />
              </ProvedorMarca>
            </ProvedorSessao>
          </ProvedorAvisos>
        </BrowserRouter>
      ) : (
        <FaltaConfiguracao />
      )}
    </ProvedorTema>
  )
}
