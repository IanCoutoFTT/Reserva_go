import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PropertyImage } from '../PropertyImage';

describe('PropertyImage', () => {
  it('sem foto mostra o placeholder (não um bloco vazio)', () => {
    render(<PropertyImage uri={null} />);

    expect(screen.getByTestId('property-image-placeholder')).toBeTruthy();
  });

  it('com foto não mostra o placeholder', () => {
    render(<PropertyImage uri="https://example.com/foto.jpg" />);

    expect(screen.queryByTestId('property-image-placeholder')).toBeNull();
  });
});
