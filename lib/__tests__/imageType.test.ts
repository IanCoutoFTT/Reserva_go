import { imageTypeFromUri } from '../imageType';

describe('imageTypeFromUri', () => {
  it('mapeia extensões para MIME types reais', () => {
    expect(imageTypeFromUri('file:///tmp/a.JPG')).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
    expect(imageTypeFromUri('file:///tmp/a.jpeg')).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
    expect(imageTypeFromUri('file:///tmp/a.png?x=1')).toEqual({ ext: 'png', contentType: 'image/png' });
    expect(imageTypeFromUri('file:///tmp/a.heic')).toEqual({ ext: 'heic', contentType: 'image/heic' });
  });

  it('extensão desconhecida ou perigosa vira JPEG (nunca um content-type inventado)', () => {
    expect(imageTypeFromUri('file:///tmp/pagina.html')).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
    expect(imageTypeFromUri('file:///tmp/semextensao')).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
  });
});
