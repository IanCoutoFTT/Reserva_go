const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}));

import { addBlock, availablePropertyIds, blockedRanges, isMissingFunction, listBlocks, removeBlock } from '../availabilityService';

function builder(result: { data?: unknown; error?: unknown }) {
  const b: any = {
    select: jest.fn(() => b), insert: jest.fn(() => b), delete: jest.fn(() => b), eq: jest.fn(() => b),
    gte: jest.fn(() => b), order: jest.fn(() => b), single: jest.fn(() => Promise.resolve(result)),
    then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
  };
  return b;
}

beforeEach(() => jest.clearAllMocks());

describe('isMissingFunction', () => {
  it('reconhece "função ainda não existe" (migração não aplicada)', () => {
    expect(isMissingFunction({ code: 'PGRST202' })).toBe(true);
    expect(isMissingFunction({ code: '42883' })).toBe(true);
    expect(isMissingFunction({ message: 'Could not find the function public.x in the schema cache' })).toBe(true);
    expect(isMissingFunction({ code: '23514', message: 'regra' })).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
  });
});

describe('availablePropertyIds', () => {
  it('chama a função com as datas e devolve os ids (aceita lista de ids ou de objetos)', async () => {
    mockRpc.mockResolvedValue({ data: ['a', 'b'], error: null });
    expect(await availablePropertyIds('2026-12-20', '2026-12-23')).toEqual({ data: ['a', 'b'], error: null });
    expect(mockRpc).toHaveBeenCalledWith('available_property_ids', { p_check_in: '2026-12-20', p_check_out: '2026-12-23' });
    mockRpc.mockResolvedValue({ data: [{ available_property_ids: 'c' }], error: null });
    expect((await availablePropertyIds('2026-12-20', '2026-12-23')).data).toEqual(['c']);
  });
  it('banco sem a migração 021: aviso claro, sem quebrar', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    const r = await availablePropertyIds('2026-12-20', '2026-12-23');
    expect(r.data).toBeNull();
    expect(r.error).toMatch(/ainda não está disponível/);
  });
  it('regra do banco (check_violation) aparece em português; outro erro vira texto genérico', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'Escolha um período de até 60 noites.' } });
    expect((await availablePropertyIds('a', 'b')).error).toMatch(/60 noites/);
    mockRpc.mockResolvedValue({ data: null, error: { code: '500', message: 'boom interno' } });
    expect((await availablePropertyIds('a', 'b')).error).not.toContain('boom');
  });
});

describe('blockedRanges', () => {
  it('devolve os períodos no formato início/fim', async () => {
    mockRpc.mockResolvedValue({ data: [{ start_date: '2026-12-20', end_date: '2026-12-25' }], error: null });
    expect(await blockedRanges('p1')).toEqual({ data: [{ start: '2026-12-20', end: '2026-12-25' }], error: null });
    expect(mockRpc).toHaveBeenCalledWith('blocked_ranges', { p_property_id: 'p1' });
  });
  it('banco sem a migração: lista vazia, sem erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await blockedRanges('p1')).toEqual({ data: [], error: null });
  });
});

describe('bloqueios do anfitrião', () => {
  it('listBlocks consulta só os da cabana, a partir de hoje', async () => {
    const b = builder({ data: [{ id: '1', start_date: '2026-12-20', end_date: '2026-12-25', reason: null }], error: null });
    mockFrom.mockReturnValue(b);
    const r = await listBlocks('p1');
    expect(mockFrom).toHaveBeenCalledWith('property_blocks');
    expect(b.eq).toHaveBeenCalledWith('property_id', 'p1');
    expect(b.gte).toHaveBeenCalledWith('end_date', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(r.data).toHaveLength(1);
  });
  it('addBlock grava em nome de quem pede e corta o motivo em 200 caracteres', async () => {
    const b = builder({ data: { id: '9', start_date: '2026-12-20', end_date: '2026-12-25', reason: 'x' }, error: null });
    mockFrom.mockReturnValue(b);
    await addBlock({ propertyId: 'p1', userId: 'u1', start: '2026-12-20', end: '2026-12-25', reason: '  ' + 'x'.repeat(300) + '  ' });
    const sent = b.insert.mock.calls[0][0];
    expect(sent).toMatchObject({ property_id: 'p1', created_by: 'u1', start_date: '2026-12-20', end_date: '2026-12-25' });
    expect(sent.reason).toHaveLength(200);
  });
  it('addBlock sem motivo grava null', async () => {
    const b = builder({ data: { id: '9' }, error: null });
    mockFrom.mockReturnValue(b);
    await addBlock({ propertyId: 'p1', userId: 'u1', start: 'a', end: 'b', reason: '   ' });
    expect(b.insert.mock.calls[0][0].reason).toBeNull();
  });
  it('erros do banco viram mensagens claras', async () => {
    mockFrom.mockReturnValue(builder({ error: { code: '23P01', message: 'conflicting key value violates exclusion constraint' } }));
    expect((await addBlock({ propertyId: 'p', userId: 'u', start: 'a', end: 'b' })).error).toBe('Já existe um bloqueio nesse período.');
    mockFrom.mockReturnValue(builder({ error: { code: '23514', message: 'Já existe uma reserva ativa nesse período. Cancele-a antes de bloquear as datas.' } }));
    expect((await addBlock({ propertyId: 'p', userId: 'u', start: 'a', end: 'b' })).error).toMatch(/reserva ativa/);
    mockFrom.mockReturnValue(builder({ error: { code: '42501', message: 'new row violates row-level security policy' } }));
    expect((await addBlock({ propertyId: 'p', userId: 'u', start: 'a', end: 'b' })).error).toMatch(/dono da cabana/);
    mockFrom.mockReturnValue(builder({ error: { code: 'XX', message: 'erro tecnico secreto' } }));
    expect((await addBlock({ propertyId: 'p', userId: 'u', start: 'a', end: 'b' })).error).not.toContain('secreto');
  });
  it('removeBlock apaga pelo id', async () => {
    const b = builder({ error: null });
    mockFrom.mockReturnValue(b);
    expect(await removeBlock('9')).toEqual({ data: true, error: null });
    expect(b.eq).toHaveBeenCalledWith('id', '9');
  });
});
