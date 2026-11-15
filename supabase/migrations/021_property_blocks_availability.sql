-- ============================================================
-- Migração 021: calendário de bloqueio do anfitrião e busca por disponibilidade
-- ============================================================
--
--  * property_blocks: períodos em que o anfitrião NÃO aceita reservas (manutenção, uso próprio,
--    feriado). Só o dono da cabana cria e apaga os seus bloqueios; o admin lê. As datas
--    seguem a lógica das reservas: início incluso, fim EXCLUSO (o dia do "fim" fica livre
--    para um check-in), no máximo 365 dias, sem sobrepor outro bloqueio da mesma cabana.
--  * Bloqueio não pode cobrir uma reserva que já existe (a reserva ativa vem primeiro).
--  * Reserva nova (ou com datas alteradas) que cai num bloqueio é RECUSADA pelo banco,
--    mesmo se o app não avisar. Vale para todos, inclusive a service_role.
--  * is_property_free(cabana, entrada, saída): livre de reservas E de bloqueios.
--  * available_property_ids(entrada, saída): ids das cabanas ativas livres nesse período
--    (alimenta o filtro "disponibilidade por data" da Explorar). Só devolve ids: não revela
--    quem reservou.
--  * blocked_ranges(cabana): os períodos bloqueados, sem o motivo, para o calendário do
--    hóspede mostrar as datas indisponíveis.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.property_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  reason      TEXT CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT property_blocks_datas CHECK (end_date > start_date),
  CONSTRAINT property_blocks_max_dias CHECK (end_date - start_date <= 365)
);

CREATE INDEX IF NOT EXISTS idx_property_blocks_property ON public.property_blocks (property_id, start_date);

DO $$ BEGIN
  ALTER TABLE public.property_blocks
    ADD CONSTRAINT property_blocks_no_overlap
    EXCLUDE USING gist (property_id WITH =, daterange(start_date, end_date) WITH &&);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

ALTER TABLE public.property_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.property_blocks TO authenticated;

DROP POLICY IF EXISTS "property_blocks_owner_read" ON public.property_blocks;
CREATE POLICY "property_blocks_owner_read" ON public.property_blocks
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "property_blocks_admin_read" ON public.property_blocks;
CREATE POLICY "property_blocks_admin_read" ON public.property_blocks
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "property_blocks_owner_insert" ON public.property_blocks;
CREATE POLICY "property_blocks_owner_insert" ON public.property_blocks
  FOR INSERT TO authenticated WITH CHECK (
    public.is_active_user()
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "property_blocks_owner_delete" ON public.property_blocks;
CREATE POLICY "property_blocks_owner_delete" ON public.property_blocks
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.owner_id = auth.uid())
  );

-- ── Bloqueio novo não pode cobrir reserva ativa ──────────────
-- SECURITY DEFINER: precisa enxergar as reservas de todos os hóspedes da cabana.
CREATE OR REPLACE FUNCTION public.check_block_vs_bookings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.property_id = NEW.property_id
       AND b.status::text = 'reservada'
       AND daterange(b.check_in, b.check_out) && daterange(NEW.start_date, NEW.end_date)
  ) THEN
    RAISE EXCEPTION 'Já existe uma reserva ativa nesse período. Cancele-a antes de bloquear as datas.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_blocks_check_bookings ON public.property_blocks;
CREATE TRIGGER property_blocks_check_bookings
  BEFORE INSERT ON public.property_blocks
  FOR EACH ROW EXECUTE FUNCTION public.check_block_vs_bookings();

-- ── Reserva nova não pode cair num bloqueio ─────────────────
CREATE OR REPLACE FUNCTION public.check_booking_vs_blocks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'cancelada' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.property_blocks pb
     WHERE pb.property_id = NEW.property_id
       AND daterange(pb.start_date, pb.end_date) && daterange(NEW.check_in, NEW.check_out)
  ) THEN
    RAISE EXCEPTION 'Essas datas estão bloqueadas pelo anfitrião. Escolha outro período.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_check_blocks ON public.bookings;
CREATE TRIGGER bookings_check_blocks
  BEFORE INSERT OR UPDATE OF check_in, check_out, status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.check_booking_vs_blocks();

-- ── Livre de reservas E de bloqueios ────────────────────────
CREATE OR REPLACE FUNCTION public.is_property_free(
  p_property_id UUID, p_check_in DATE, p_check_out DATE, p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.bookings b
            WHERE b.property_id = p_property_id
              AND b.status::text <> 'cancelada'
              AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
              AND daterange(b.check_in, b.check_out) && daterange(p_check_in, p_check_out)
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.property_blocks pb
            WHERE pb.property_id = p_property_id
              AND daterange(pb.start_date, pb.end_date) && daterange(p_check_in, p_check_out)
         );
$$;

-- ── Cabanas ativas livres no período (filtro da Explorar) ────
CREATE OR REPLACE FUNCTION public.available_property_ids(p_check_in DATE, p_check_out DATE)
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'Escolha uma saída depois da entrada.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_check_out - p_check_in > 60 THEN
    RAISE EXCEPTION 'Escolha um período de até 60 noites.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY
    SELECT p.id
      FROM public.properties p
     WHERE p.status::text = 'ativo'
       AND public.is_property_free(p.id, p_check_in, p_check_out);
END;
$$;

-- ── Períodos bloqueados, para o calendário do hóspede ───────
CREATE OR REPLACE FUNCTION public.blocked_ranges(p_property_id UUID)
RETURNS TABLE (start_date DATE, end_date DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pb.start_date, pb.end_date
    FROM public.property_blocks pb
    JOIN public.properties p ON p.id = pb.property_id
   WHERE pb.property_id = p_property_id
     AND p.status::text = 'ativo'
     AND pb.end_date >= CURRENT_DATE
   ORDER BY pb.start_date;
$$;

REVOKE ALL ON FUNCTION public.check_block_vs_bookings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_booking_vs_blocks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_property_free(UUID, DATE, DATE, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.available_property_ids(DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.blocked_ranges(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_property_free(UUID, DATE, DATE, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.available_property_ids(DATE, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blocked_ranges(UUID) TO anon, authenticated;

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT to_regclass('public.property_blocks');                                                                                    -- a tabela
-- SELECT proname FROM pg_proc WHERE proname IN ('is_property_free','available_property_ids','blocked_ranges');                      -- 3 linhas
-- SELECT tgname FROM pg_trigger WHERE tgname IN ('property_blocks_check_bookings','bookings_check_blocks');                         -- 2 linhas
