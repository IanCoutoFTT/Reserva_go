import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BlockDatesModal } from '../BlockDatesModal';
import * as service from '../../services/availabilityService';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// o cliente real do Supabase não cria no Node 20 (sem WebSocket nativo); estes testes não precisam dele
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../services/availabilityService');

const mocked = service as jest.Mocked<typeof service>;
const props = { visible: true, propertyId: 'p1', propertyTitle: 'Chalé do Lago', userId: 'u1', onClose: jest.fn() };

const pad = (n: number) => String(n).padStart(2, '0');
/** Dia do MÊS SEGUINTE a hoje (sempre no futuro, em qualquer dia do ano em que o teste rode). */
function nextMonthIso(day: number): string {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(day)}`;
}

async function pickNextMonthPeriod() {
  fireEvent.press(screen.getByTestId('block-add'));
  fireEvent.press(await screen.findByLabelText('Próximo mês'));
  fireEvent.press(screen.getByTestId(`drp-day-${nextMonthIso(10)}`));
  fireEvent.press(screen.getByTestId(`drp-day-${nextMonthIso(12)}`));
  await act(async () => {
    fireEvent.press(screen.getByTestId('drp-confirm'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.listBlocks.mockResolvedValue({ data: [], error: null });
  mocked.addBlock.mockResolvedValue({ data: { id: 'b1', start_date: '2099-01-10', end_date: '2099-01-15', reason: null }, error: null });
  mocked.removeBlock.mockResolvedValue({ data: true, error: null });
});

describe('BlockDatesModal', () => {
  it('sem bloqueios mostra o aviso de lista vazia', async () => {
    render(<BlockDatesModal {...props} />);
    expect(await screen.findByTestId('blocks-empty')).toBeTruthy();
    expect(screen.getByText('Nenhum período bloqueado.')).toBeTruthy();
    expect(mocked.listBlocks).toHaveBeenCalledWith('p1');
  });

  it('lista os bloqueios com datas, noites e motivo', async () => {
    mocked.listBlocks.mockResolvedValue({ data: [{ id: 'b1', start_date: '2099-01-10', end_date: '2099-01-15', reason: 'Manutenção' }], error: null });
    render(<BlockDatesModal {...props} />);
    expect(await screen.findByText('10/01/2099 → 15/01/2099')).toBeTruthy();
    expect(screen.getByText('5 noites · Manutenção')).toBeTruthy();
  });

  it('falha ao carregar: avisa em vez de mostrar "nenhum bloqueio"', async () => {
    mocked.listBlocks.mockResolvedValue({ data: null, error: 'x' });
    render(<BlockDatesModal {...props} />);
    expect(await screen.findByText('Não foi possível carregar os bloqueios agora.')).toBeTruthy();
  });

  it('remover pede confirmação e só então apaga', async () => {
    mocked.listBlocks.mockResolvedValue({ data: [{ id: 'b1', start_date: '2099-01-10', end_date: '2099-01-15', reason: null }], error: null });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<BlockDatesModal {...props} />);
    fireEvent.press(await screen.findByTestId('block-remove'));
    expect(mocked.removeBlock).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === 'Remover')!.onPress!();
    });
    expect(mocked.removeBlock).toHaveBeenCalledWith('b1');
    alert.mockRestore();
  });

  it('escolher um período salva o bloqueio em nome do anfitrião, com o motivo digitado', async () => {
    render(<BlockDatesModal {...props} />);
    await screen.findByTestId('blocks-empty');
    fireEvent.changeText(screen.getByLabelText('Motivo do bloqueio'), 'Pintura');
    await pickNextMonthPeriod();
    await waitFor(() => expect(mocked.addBlock).toHaveBeenCalled());
    expect(mocked.addBlock).toHaveBeenCalledWith({ propertyId: 'p1', userId: 'u1', start: nextMonthIso(10), end: nextMonthIso(12), reason: 'Pintura' });
  });

  it('erro do banco ao bloquear aparece num alerta', async () => {
    mocked.addBlock.mockResolvedValue({ data: null, error: 'Já existe uma reserva ativa nesse período. Cancele-a antes de bloquear as datas.' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<BlockDatesModal {...props} />);
    await screen.findByTestId('blocks-empty');
    await pickNextMonthPeriod();
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Bloqueio não salvo', expect.stringMatching(/reserva ativa/)));
    alert.mockRestore();
  });
});
