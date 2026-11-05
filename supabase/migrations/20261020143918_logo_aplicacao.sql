-- Configurações gerais do aplicativo (linha única), começando pelo logo exibido no cabeçalho.
create table if not exists public.configuracoes_app (
  id smallint primary key default 1 check (id = 1),
  logo_caminho text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null default auth.uid()
);
comment on table public.configuracoes_app is 'Configurações gerais do SOOL2.ai (linha única). logo_caminho aponta para o bucket público "logos".';

insert into public.configuracoes_app (id) values (1) on conflict (id) do nothing;

alter table public.configuracoes_app enable row level security;

create policy configuracoes_app_ler on public.configuracoes_app for select to authenticated using (true);
create policy configuracoes_app_editar on public.configuracoes_app for update to authenticated using (id = 1) with check (id = 1);

create or replace function public.tocar_configuracoes_app()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
revoke execute on function public.tocar_configuracoes_app() from public, anon, authenticated;

create trigger configuracoes_app_tocar before update on public.configuracoes_app
  for each row execute function public.tocar_configuracoes_app();

-- Bucket público para o logo (leitura pela URL pública; escrita só por usuários autenticados).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy logos_ler on storage.objects for select to authenticated using (bucket_id = 'logos');
create policy logos_incluir on storage.objects for insert to authenticated with check (bucket_id = 'logos');
create policy logos_editar on storage.objects for update to authenticated using (bucket_id = 'logos');
create policy logos_excluir on storage.objects for delete to authenticated using (bucket_id = 'logos');;
