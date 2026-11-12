-- Round settings are read only by round SQL functions and the service; visitors get no table privileges.
REVOKE ALL ON public.round_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.round_settings TO service_role;