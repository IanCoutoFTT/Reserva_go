import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ImageGallery } from '../ImageGallery';

describe('ImageGallery', () => {
  it('sem nenhuma foto mostra o placeholder e nenhum contador', () => {
    render(<ImageGallery images={[]} />);
    expect(screen.getByTestId('property-image-placeholder')).toBeTruthy();
    expect(screen.queryByTestId('gallery-counter')).toBeNull();
  });

  it('com uma foto só não mostra contador', () => {
    render(<ImageGallery images={['https://exemplo.com/a.jpg']} />);
    expect(screen.queryByTestId('gallery-counter')).toBeNull();
    expect(screen.queryByTestId('property-image-placeholder')).toBeNull();
  });

  it('com várias fotos mostra "1/3" e atualiza ao deslizar', () => {
    render(<ImageGallery images={['https://exemplo.com/a.jpg', 'https://exemplo.com/b.jpg', 'https://exemplo.com/c.jpg']} />);
    expect(screen.getByTestId('gallery-counter').props.children.join('')).toBe('1/3');

    // a largura da janela no jest é 750: deslizar uma página = offset 750
    const list = screen.UNSAFE_getByType(require('react-native').FlatList);
    fireEvent(list, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 750 } } });
    expect(screen.getByTestId('gallery-counter').props.children.join('')).toBe('2/3');

    fireEvent(list, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 99999 } } });
    expect(screen.getByTestId('gallery-counter').props.children.join('')).toBe('3/3'); // nunca passa do total
  });
});
