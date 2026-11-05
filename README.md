# Demo.SOOL2.ai — ambiente de demonstração do SOOL2.ai

Cópia do SOOL2.ai criada em 05/11/2026 para demonstração. Site: demo-sool2ai.vercel.app · Supabase: projeto qbggbkbxxnltzyztqpkn (Demo.SOOL2.ai).

## Conteúdo

| Pasta / arquivo | O que é |
|---|---|
| `src/`, `index.html`, `public/` | Front-end em React 18 + TypeScript + Vite + Tailwind |
| `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js` | Configuração do build |
| `vercel.json` | Configuração da hospedagem na Vercel |
| `supabase/migrations/` | Esquema do banco (tabelas, RLS, funções), na ordem em que foi aplicado |
| `supabase/functions/` | Edge Functions (Deno): `perguntar` (IA), `testar-ia`, `entrar-sool` (login pelo SQL Server do SOOL) e o código comum em `_shared/` |
| `supabase/config.toml` | `verify_jwt` de cada função, como está no projeto |
| `.env.example` | Variáveis do front-end |

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha a chave pública do Supabase
npm run dev
```

## Publicar

- **Front-end:** `npm run build` gera `dist/`; na Vercel, framework "Vite", com as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- **Banco:** aplique os arquivos de `supabase/migrations/` em ordem (ou `supabase db push` com o Supabase CLI).
- **Funções:** `supabase functions deploy perguntar testar-ia entrar-sool`.

## O que NÃO está no pacote (por segurança)

- Chaves de API das plataformas de IA: ficam no Supabase Vault e são cadastradas pela tela Configurações.
- String de conexão do SQL Server do SOOL: fica no Vault com o nome `sool_sql_conexao`.
- Chave secreta (service_role) do Supabase: as Edge Functions a recebem do ambiente automaticamente.
- Os dados dos cenários importados (estão no banco; não fazem parte do código).
