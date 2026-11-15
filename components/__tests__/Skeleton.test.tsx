import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SkeletonCardList, SkeletonRowList } from '../Skeleton';

describe('Skeleton', () => {
  it('lista de cartões: a quantidade pedida e um aviso "Carregando" para o leitor de tela', () => {
    render(<SkeletonCardList count={4} />);
    const list = screen.getByTestId('skeleton-cards');
    expect(list.props.accessibilityLabel).toBe('Carregando');
    expect(list.props.accessibilityRole).toBe('progressbar');
    expect(list.children).toHaveLength(4);
  });

  it('lista de linhas: renderiza e some ao desmontar sem erro (a animação é parada)', () => {
    const { unmount } = render(<SkeletonRowList count={3} />);
    expect(screen.getByTestId('skeleton-rows')).toBeTruthy();
    expect(() => unmount()).not.toThrow();
  });
});
