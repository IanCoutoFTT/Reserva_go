import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ChatImage } from '../ChatImage';
import * as service from '../../services/chatImageService';

jest.mock('../../services/chatImageService');
const mocked = service as jest.Mocked<typeof service>;

describe('ChatImage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mostra o carregamento e depois a foto', async () => {
    mocked.getChatImageUrl.mockResolvedValue({ data: 'https://x/a.jpg', error: null });
    render(<ChatImage path="c1/a.jpg" />);
    expect(screen.getByTestId('chat-image-loading')).toBeTruthy();
    expect(await screen.findByTestId('chat-image')).toBeTruthy();
    expect(mocked.getChatImageUrl).toHaveBeenCalledWith('c1/a.jpg');
  });

  it('falha ao carregar: mostra "Foto indisponível" em vez de um quadrado vazio', async () => {
    mocked.getChatImageUrl.mockResolvedValue({ data: null, error: 'x' });
    render(<ChatImage path="c1/a.jpg" />);
    expect(await screen.findByTestId('chat-image-failed')).toBeTruthy();
    expect(screen.getByText('Foto indisponível')).toBeTruthy();
  });

  it('tocar abre a foto em tela cheia e o botão fecha', async () => {
    mocked.getChatImageUrl.mockResolvedValue({ data: 'https://x/a.jpg', error: null });
    render(<ChatImage path="c1/a.jpg" />);
    fireEvent.press(await screen.findByTestId('chat-image'));
    const close = await screen.findByTestId('chat-image-close');
    fireEvent.press(close);
    expect(screen.queryByTestId('chat-image-close')).toBeNull();
  });

  it('o leitor de tela recebe um rótulo na foto', async () => {
    mocked.getChatImageUrl.mockResolvedValue({ data: 'https://x/a.jpg', error: null });
    render(<ChatImage path="c1/a.jpg" />);
    const img = await screen.findByTestId('chat-image');
    expect(img.props.accessibilityLabel).toMatch(/Toque para ampliar/);
  });
});
