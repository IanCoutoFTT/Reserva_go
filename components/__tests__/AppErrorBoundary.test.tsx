import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AppErrorBoundary } from '../AppErrorBoundary';
import * as errorService from '../../services/errorService';

// o cliente real do Supabase não cria no Node 20 (sem WebSocket nativo); estes testes não precisam dele
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../services/errorService');
const mocked = errorService as jest.Mocked<typeof errorService>;

describe('AppErrorBoundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mostra uma mensagem amigável, sem o texto técnico do erro', () => {
    render(<AppErrorBoundary error={new Error('Cannot read property x of undefined')} retry={jest.fn()} />);
    expect(screen.getByText('Algo deu errado')).toBeTruthy();
    expect(screen.queryByText(/Cannot read property/)).toBeNull();
  });

  it('registra o erro uma vez, com a origem', () => {
    const err = new Error('boom');
    render(<AppErrorBoundary error={err} retry={jest.fn()} />);
    expect(mocked.reportError).toHaveBeenCalledTimes(1);
    expect(mocked.reportError).toHaveBeenCalledWith(err, 'tela quebrada');
  });

  it('o botão tenta de novo', () => {
    const retry = jest.fn();
    render(<AppErrorBoundary error={new Error('x')} retry={retry} />);
    fireEvent.press(screen.getByTestId('error-retry'));
    expect(retry).toHaveBeenCalled();
  });
});
