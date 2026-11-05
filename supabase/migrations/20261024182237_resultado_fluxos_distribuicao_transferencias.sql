create table if not exists public.resultado_distribuicao_fc (
  id bigint generated always as identity primary key,
  cenario_id uuid not null,
  codigo text not null,
  origem text not null,
  destino text not null,
  modal text,
  frete text,
  periodo_entrega text,
  resultado_otimizacao numeric,
  constraint resultado_distribuicao_fc_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
  constraint resultado_distribuicao_fc_uk1 unique (cenario_id, codigo)
);
create index if not exists resultado_distribuicao_fc_idx1 on public.resultado_distribuicao_fc (cenario_id, origem);
create index if not exists resultado_distribuicao_fc_idx2 on public.resultado_distribuicao_fc (cenario_id, destino);
comment on table public.resultado_distribuicao_fc is 'Resultado da otimização: distribuição de fornecedor para base (FC). Cada linha liga uma oferta a um cliente/base por um frete.';
comment on column public.resultado_distribuicao_fc.cenario_id is 'Cenário (arquivo XML) ao qual o registro pertence.';
comment on column public.resultado_distribuicao_fc.codigo is 'Identificador do fluxo.';
comment on column public.resultado_distribuicao_fc.origem is 'Oferta de origem (ofertas_fob.codigo ou ofertas_cif.codigo do mesmo cenário).';
comment on column public.resultado_distribuicao_fc.destino is 'Cliente/base de destino (clientes.codigo do mesmo cenário).';
comment on column public.resultado_distribuicao_fc.modal is 'Modal (modais.codigo do mesmo cenário).';
comment on column public.resultado_distribuicao_fc.frete is 'Frete usado (fretes_fc.codigo do mesmo cenário).';
comment on column public.resultado_distribuicao_fc.periodo_entrega is 'Período de entrega (ex.: 2026-08).';
comment on column public.resultado_distribuicao_fc.resultado_otimizacao is 'Volume distribuído no fluxo.';

create table if not exists public.resultado_transferencias (
  id bigint generated always as identity primary key,
  cenario_id uuid not null,
  codigo text not null,
  origem text not null,
  destino text not null,
  modal text,
  produto text,
  periodo integer,
  custo_unitario numeric,
  resultado_otimizacao numeric,
  periodo_entrega text,
  constraint resultado_transferencias_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
  constraint resultado_transferencias_uk1 unique (cenario_id, codigo)
);
create index if not exists resultado_transferencias_idx1 on public.resultado_transferencias (cenario_id, origem, destino);
comment on table public.resultado_transferencias is 'Resultado da otimização: transferências entre clientes/bases (CC).';
comment on column public.resultado_transferencias.cenario_id is 'Cenário (arquivo XML) ao qual o registro pertence.';
comment on column public.resultado_transferencias.codigo is 'Identificador da transferência.';
comment on column public.resultado_transferencias.origem is 'Cliente/base de origem (clientes.codigo do mesmo cenário).';
comment on column public.resultado_transferencias.destino is 'Cliente/base de destino (clientes.codigo do mesmo cenário).';
comment on column public.resultado_transferencias.modal is 'Modal (modais.codigo do mesmo cenário).';
comment on column public.resultado_transferencias.produto is 'Produto (produtos.codigo do mesmo cenário).';
comment on column public.resultado_transferencias.periodo is 'Período.';
comment on column public.resultado_transferencias.custo_unitario is 'Custo de transporte por unidade de medida.';
comment on column public.resultado_transferencias.resultado_otimizacao is 'Volume transferido.';
comment on column public.resultado_transferencias.periodo_entrega is 'Período de entrega.';

do $$
declare
  t text;
begin
  foreach t in array array['resultado_distribuicao_fc', 'resultado_transferencias'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ler', t);
    execute format('drop policy if exists %I on public.%I', t || '_incluir', t);
    execute format('drop policy if exists %I on public.%I', t || '_editar', t);
    execute format('drop policy if exists %I on public.%I', t || '_excluir', t);
    execute format('create policy %I on public.%I for select to authenticated using (exists (select 1 from public.cenarios c where c.id = cenario_id and (c.status = ''concluido'' or c.usuario_id = (select auth.uid()))))', t || '_ler', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (exists (select 1 from public.cenarios c where c.id = cenario_id and c.usuario_id = (select auth.uid())))', t || '_incluir', t);
    execute format('create policy %I on public.%I for update to authenticated using (exists (select 1 from public.cenarios c where c.id = cenario_id and c.usuario_id = (select auth.uid()))) with check (exists (select 1 from public.cenarios c where c.id = cenario_id and c.usuario_id = (select auth.uid())))', t || '_editar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (exists (select 1 from public.cenarios c where c.id = cenario_id and c.usuario_id = (select auth.uid())))', t || '_excluir', t);
  end loop;
end $$;

do $$
declare
  f regprocedure;
  def text;
  novo text;
begin
  foreach f in array array['public.executar_consulta_ia(text)'::regprocedure, 'public.substituir_cenario(uuid, uuid)'::regprocedure] loop
    def := pg_get_functiondef(f);
    if def like '%''resultado_transferencias''%' then
      continue;
    end if;
    novo := replace(def, '''ofertas_fob_grupo_ofertas_fob'', ''fretes_cc''];',
      '''ofertas_fob_grupo_ofertas_fob'', ''fretes_cc'', ''resultado_distribuicao_fc'', ''resultado_transferencias''];');
    if novo = def then
      raise exception 'Lista de tabelas não encontrada em %', f;
    end if;
    execute novo;
  end loop;
end $$;;
