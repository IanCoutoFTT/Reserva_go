import { addDays, formatBR, isInRanges, monthCells, nightsBetween, overlapsRanges, parseISO, pickDay, toISO } from '../dateRange';

describe('datas', () => {
  it('toISO e parseISO são o inverso um do outro', () => {
    expect(toISO(new Date(2026, 11, 5))).toBe('2026-12-05');
    expect(parseISO('2026-12-05')).toEqual({ year: 2026, month0: 11, day: 5 });
  });
  it('parseISO recusa data impossível ou fora do formato', () => {
    expect(parseISO('2026-02-30')).toBeNull();
    expect(parseISO('26-12-05')).toBeNull();
    expect(parseISO('lixo')).toBeNull();
  });
  it('addDays atravessa mês e ano', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('nightsBetween conta noites, mesmo com mudança de horário de verão', () => {
    expect(nightsBetween('2026-12-20', '2026-12-23')).toBe(3);
    expect(nightsBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(nightsBetween('2026-12-20', 'x')).toBe(0);
  });
  it('formatBR', () => {
    expect(formatBR('2026-12-05')).toBe('05/12/2026');
    expect(formatBR('lixo')).toBe('');
  });
});

describe('períodos [início, fim)', () => {
  const ranges = [{ start: '2026-12-20', end: '2026-12-25' }];
  it('isInRanges: o fim fica de fora', () => {
    expect(isInRanges('2026-12-20', ranges)).toBe(true);
    expect(isInRanges('2026-12-24', ranges)).toBe(true);
    expect(isInRanges('2026-12-25', ranges)).toBe(false);
    expect(isInRanges('2026-12-19', ranges)).toBe(false);
  });
  it('overlapsRanges: terminar no dia do início ou começar no dia do fim não conta', () => {
    expect(overlapsRanges('2026-12-18', '2026-12-20', ranges)).toBe(false);
    expect(overlapsRanges('2026-12-25', '2026-12-27', ranges)).toBe(false);
    expect(overlapsRanges('2026-12-19', '2026-12-21', ranges)).toBe(true);
    expect(overlapsRanges('2026-12-21', '2026-12-23', ranges)).toBe(true);
    expect(overlapsRanges('2026-12-10', '2026-12-30', ranges)).toBe(true);
  });
});

describe('monthCells', () => {
  it('dezembro de 2026 começa numa terça: 2 espaços e 31 dias', () => {
    const cells = monthCells(2026, 11);
    expect(cells.slice(0, 2)).toEqual([null, null]);
    expect(cells[2]).toBe('2026-12-01');
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(cells[cells.length - 1]).toBe('2026-12-31');
  });
  it('fevereiro de ano bissexto tem 29 dias', () => {
    expect(monthCells(2028, 1).filter(Boolean)).toHaveLength(29);
  });
});

describe('pickDay', () => {
  const none = { start: null, end: null };
  it('primeiro toque define o início', () => {
    expect(pickDay(none, '2026-12-10')).toEqual({ start: '2026-12-10', end: null });
  });
  it('segundo toque depois do início define o fim', () => {
    expect(pickDay({ start: '2026-12-10', end: null }, '2026-12-13')).toEqual({ start: '2026-12-10', end: '2026-12-13' });
  });
  it('toque antes (ou no mesmo dia) do início recomeça', () => {
    expect(pickDay({ start: '2026-12-10', end: null }, '2026-12-08')).toEqual({ start: '2026-12-08', end: null });
    expect(pickDay({ start: '2026-12-10', end: null }, '2026-12-10')).toEqual({ start: '2026-12-10', end: null });
  });
  it('com o período completo, um novo toque recomeça', () => {
    expect(pickDay({ start: '2026-12-10', end: '2026-12-13' }, '2026-12-20')).toEqual({ start: '2026-12-20', end: null });
  });
  it('período que cobre dia indisponível não fecha: recomeça no dia tocado', () => {
    const blocked = [{ start: '2026-12-12', end: '2026-12-14' }];
    expect(pickDay({ start: '2026-12-10', end: null }, '2026-12-15', blocked)).toEqual({ start: '2026-12-15', end: null });
    expect(pickDay({ start: '2026-12-10', end: null }, '2026-12-12', blocked)).toEqual({ start: '2026-12-10', end: '2026-12-12' });
  });
});
