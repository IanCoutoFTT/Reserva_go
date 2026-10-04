// Mock autocontido do cliente Supabase (sem referenciar nada de fora do
// factory - jest.mock() é hoisted acima dos imports, então variáveis
// externas ainda não existiriam nesse ponto).
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
    storage: { from: jest.fn() },
  })),
}));

// uploadPropertyImage lê o arquivo via expo-file-system (File.arrayBuffer())
// - fetch(uri).blob() foi testado ao vivo num Android real e falhou com
// "Network request failed" no upload pro Storage (ver comentário na função).
const mockArrayBuffer = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ arrayBuffer: mockArrayBuffer })),
}));

import { supabase } from '../../lib/supabase';
import { approveProperty, getPropertiesByHost, getPropertyById, getProperties, setFeatured, uploadPropertyImage } from '../propertyService';

/** Builder encadeável e "thenable" - cobre tanto `await query.eq(...)` quanto `await query.select().single()`. */
function makeBuilder(result: { data: any; error: any }): any {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    lte: jest.fn(() => builder),
    gte: jest.fn(() => builder),
    or: jest.fn(() => builder),
    order: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('propertyService.getProperties', () => {
  it('caminho feliz: filtra por status "ativo" por padrão', async () => {
    const builder = makeBuilder({ data: [{ id: 'p1', title: 'Cabana' }], error: null });
    mockFrom.mockReturnValue(builder);

    const result = await getProperties();

    expect(mockFrom).toHaveBeenCalledWith('properties');
    expect(builder.eq).toHaveBeenCalledWith('status', 'ativo');
    expect(result).toEqual({ data: [{ id: 'p1', title: 'Cabana' }], error: null });
  });

  it('propaga erro do banco', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'falha de conexão' } }));

    const result = await getProperties();

    expect(result).toEqual({ data: null, error: 'falha de conexão' });
  });
});

describe('propertyService.getPropertyById', () => {
  it('caminho feliz', async () => {
    const builder = makeBuilder({ data: { id: 'p1' }, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await getPropertyById('p1');

    expect(builder.eq).toHaveBeenCalledWith('id', 'p1');
    expect(result.data).toEqual({ id: 'p1' });
  });

  it('erro (ex.: id não existe) devolve data null', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'not found' } }));

    const result = await getPropertyById('nao-existe');

    expect(result).toEqual({ data: null, error: 'not found' });
  });
});

describe('propertyService.getPropertiesByHost', () => {
  it('filtra por owner_id', async () => {
    const builder = makeBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    await getPropertiesByHost('host-1');

    expect(builder.eq).toHaveBeenCalledWith('owner_id', 'host-1');
  });
});

describe('propertyService.approveProperty', () => {
  it('aprovado=true grava status "ativo"', async () => {
    const builder = makeBuilder({ data: { id: 'p1', status: 'ativo' }, error: null });
    mockFrom.mockReturnValue(builder);

    await approveProperty('p1', true);

    expect(builder.update).toHaveBeenCalledWith({ status: 'ativo' });
  });

  it('aprovado=false grava status "inativo"', async () => {
    const builder = makeBuilder({ data: { id: 'p1', status: 'inativo' }, error: null });
    mockFrom.mockReturnValue(builder);

    await approveProperty('p1', false);

    expect(builder.update).toHaveBeenCalledWith({ status: 'inativo' });
  });
});

describe('propertyService.setFeatured', () => {
  it('featured=true grava { featured: true }', async () => {
    const builder = makeBuilder({ data: { id: 'p1', featured: true }, error: null });
    mockFrom.mockReturnValue(builder);

    await setFeatured('p1', true);

    expect(builder.update).toHaveBeenCalledWith({ featured: true });
    expect(builder.eq).toHaveBeenCalledWith('id', 'p1');
  });

  it('featured=false grava { featured: false }', async () => {
    const builder = makeBuilder({ data: { id: 'p1', featured: false }, error: null });
    mockFrom.mockReturnValue(builder);

    await setFeatured('p1', false);

    expect(builder.update).toHaveBeenCalledWith({ featured: false });
  });
});

describe('propertyService.uploadPropertyImage', () => {
  beforeEach(() => {
    mockArrayBuffer.mockResolvedValue(new ArrayBuffer(8));
  });

  it('caminho feliz: sobe o ArrayBuffer (File.arrayBuffer()) e devolve a URL pública', async () => {
    const mockUpload = jest.fn().mockResolvedValue({ error: null });
    const mockGetPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn/x.jpg' } });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload: mockUpload, getPublicUrl: mockGetPublicUrl });

    const result = await uploadPropertyImage('file:///foto.jpg', 'user-1');

    expect(supabase.storage.from).toHaveBeenCalledWith('properties');
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringContaining('user-1/'),
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: 'image/jpg' })
    );
    expect(result).toEqual({ data: 'https://cdn/x.jpg', error: null });
  });

  it('erro no upload não derruba a função - devolve { data: null, error }', async () => {
    (supabase.storage.from as jest.Mock).mockReturnValue({
      upload: jest.fn().mockResolvedValue({ error: { message: 'bucket cheio' } }),
      getPublicUrl: jest.fn(),
    });

    const result = await uploadPropertyImage('file:///foto.jpg', 'user-1');

    expect(result).toEqual({ data: null, error: 'bucket cheio' });
  });
});
