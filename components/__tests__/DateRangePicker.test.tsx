import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DateRangePicker } from '../DateRangePicker';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const base = { visible: true, title: 'Escolha o período', onClose: jest.fn(), minDate: '2026-12-01' };

describe('DateRangePicker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mostra o mês do primeiro dia permitido', () => {
    render(<DateRangePicker {...base} onConfirm={jest.fn()} />);
    expect(screen.getByTestId('drp-month').props.children.join('')).toBe('Dezembro 2026');
  });

  it('dois toques escolhem o período e o botão confirma com as datas', () => {
    const onConfirm = jest.fn();
    render(<DateRangePicker {...base} onConfirm={onConfirm} />);
    fireEvent.press(screen.getByTestId('drp-day-2026-12-10'));
    fireEvent.press(screen.getByTestId('drp-day-2026-12-13'));
    expect(screen.getByTestId('drp-start').props.children).toBe('10/12/2026');
    expect(screen.getByTestId('drp-end').props.children).toBe('13/12/2026');
    fireEvent.press(screen.getByTestId('drp-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ start: '2026-12-10', end: '2026-12-13' });
  });

  it('sem as duas datas o botão não confirma', () => {
    const onConfirm = jest.fn();
    render(<DateRangePicker {...base} onConfirm={onConfirm} />);
    fireEvent.press(screen.getByTestId('drp-day-2026-12-10'));
    fireEvent.press(screen.getByTestId('drp-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('dias antes da data mínima e períodos indisponíveis não respondem ao toque', () => {
    const onConfirm = jest.fn();
    render(<DateRangePicker {...base} minDate="2026-12-05" unavailable={[{ start: '2026-12-20', end: '2026-12-23' }]} onConfirm={onConfirm} />);
    fireEvent.press(screen.getByTestId('drp-day-2026-12-03')); // passado
    fireEvent.press(screen.getByTestId('drp-day-2026-12-21')); // bloqueado
    expect(screen.getByTestId('drp-start').props.children).toBe('Escolha');
    expect(screen.getByTestId('drp-day-2026-12-21').props.accessibilityLabel).toMatch(/indisponível/);
    // o dia do fim do bloqueio está livre
    fireEvent.press(screen.getByTestId('drp-day-2026-12-23'));
    expect(screen.getByTestId('drp-start').props.children).toBe('23/12/2026');
  });

  it('respeita o máximo de noites e avisa', () => {
    const onConfirm = jest.fn();
    render(<DateRangePicker {...base} maxNights={3} onConfirm={onConfirm} />);
    fireEvent.press(screen.getByTestId('drp-day-2026-12-10'));
    fireEvent.press(screen.getByTestId('drp-day-2026-12-20'));
    expect(screen.getByText('Escolha no máximo 3 noites.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('drp-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('navega entre os meses', () => {
    render(<DateRangePicker {...base} onConfirm={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Próximo mês'));
    expect(screen.getByTestId('drp-month').props.children.join('')).toBe('Janeiro 2027');
    fireEvent.press(screen.getByLabelText('Mês anterior'));
    fireEvent.press(screen.getByLabelText('Mês anterior'));
    expect(screen.getByTestId('drp-month').props.children.join('')).toBe('Novembro 2026');
  });
});
