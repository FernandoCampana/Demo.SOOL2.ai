alter table public.perfis enable row level security;
create policy perfis_ler on public.perfis for select to authenticated using (true);
create policy perfis_editar on public.perfis for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter table public.cenarios enable row level security;
create policy cenarios_ler on public.cenarios for select to authenticated using (true);
create policy cenarios_incluir on public.cenarios for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy cenarios_editar on public.cenarios for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy cenarios_excluir on public.cenarios for delete to authenticated using (usuario_id = (select auth.uid()));
do $$
declare
  t text;
  dono text := 'exists (select 1 from public.cenarios c where c.id = cenario_id and c.usuario_id = (select auth.uid()))';
  leitura text := 'exists (select 1 from public.cenarios c where c.id = cenario_id and (c.status = ''concluido'' or c.usuario_id = (select auth.uid())))';
begin
  foreach t in array array[
    'produtos',
    'compensacao_tributaria',
    'propriedades',
    'tipos_veiculo',
    'modais',
    'regioes',
    'fornecedores',
    'clientes',
    'clientes_uf',
    'ofertas_fob',
    'ofertas_fob_clientes',
    'ofertas_cif',
    'ofertas_cif_grupo',
    'ofertas_cif_grupo_ofertas_cif',
    'tipos_demanda',
    'demandas',
    'fretes_fc',
    'restricoes_logisticas',
    'restricoes_logisticas_clientes',
    'restricoes_logisticas_produtos',
    'restricoes_logisticas_modais',
    'restricoes_logisticas_cc',
    'restricoes_logisticas_clientes_origem',
    'restricoes_logisticas_clientes_destino',
    'restricoes_logisticas_produtos_cc',
    'restricoes_logisticas_modais_cc',
    'resultado_estoques',
    'comparativo_resultados',
    'comparativo_fornecedores',
    'comparativo_clientes',
    'comparativo_produtos',
    'comparativo_modais',
    'comparativo_clientes_produtos_resultados',
    'comparativo_logistica_clientes_produtos_resultados',
    'comparativo_clientes_produtos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_ler', t, leitura);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_incluir', t, dono);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', t || '_editar', t, dono, dono);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', t || '_excluir', t, dono);
  end loop;
end
$$;
alter table public.configuracoes_ia enable row level security;
create policy configuracoes_ia_dono on public.configuracoes_ia for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
alter table public.historico_perguntas enable row level security;
create policy historico_perguntas_dono on public.historico_perguntas for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
alter table public.parametros_mistura enable row level security;
create policy parametros_mistura_dono on public.parametros_mistura for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create or replace function public.ao_criar_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    new.email
  );
  insert into public.parametros_mistura (usuario_id, produto_final, componente, percentual, referencia, vigencia_inicio)
  values
    (new.id, 'Gasolina C Comum e Aditivada', 'Etanol Anidro', 32, 'E32, Resolução CNPE nº 9/2026, em vigor desde 01/08/2026 em caráter temporário (180 dias)', '2026-08-01'),
    (new.id, 'Gasolina C Premium', 'Etanol Anidro', 25, 'Valor do documento original; confirmar', null),
    (new.id, 'Diesel B', 'Biodiesel', 15, 'B15, vigente desde 01/08/2025', '2025-08-01');
  return new;
end;
$$;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.ao_criar_usuario();
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger configuracoes_ia_atualizado before update on public.configuracoes_ia
  for each row execute function public.tocar_atualizado_em();
create trigger parametros_mistura_atualizado before update on public.parametros_mistura
  for each row execute function public.tocar_atualizado_em();
create or replace function public.ao_excluir_configuracao_ia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.chave_api_secret_id is not null then
    delete from vault.secrets where id = old.chave_api_secret_id;
  end if;
  return old;
end;
$$;
create trigger configuracoes_ia_excluir after delete on public.configuracoes_ia
  for each row execute function public.ao_excluir_configuracao_ia();;
