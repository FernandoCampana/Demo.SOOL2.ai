-- Funções de gatilho não devem ser chamadas pela API
revoke execute on function public.ao_criar_usuario() from public, anon, authenticated;
revoke execute on function public.ao_excluir_configuracao_ia() from public, anon, authenticated;
revoke execute on function public.tocar_atualizado_em() from public, anon, authenticated;;
