alter table public.historico_perguntas add column if not exists favorita boolean not null default false;
comment on column public.historico_perguntas.favorita is 'Pergunta marcada como favorita pelo usuário.';
create index if not exists historico_perguntas_favoritas_idx on public.historico_perguntas (usuario_id, criado_em desc) where favorita;;
