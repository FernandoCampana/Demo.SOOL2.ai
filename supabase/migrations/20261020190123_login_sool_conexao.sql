-- Leitura da conexão do SQL Server (login SOOL), guardada no Vault. Só o service_role (Edge Functions) pode chamar.
create or replace function public.ler_conexao_sool()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'sool_sql_conexao' limit 1
$$;
revoke execute on function public.ler_conexao_sool() from public, anon, authenticated;
grant execute on function public.ler_conexao_sool() to service_role;;
