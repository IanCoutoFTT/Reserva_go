import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FilterModal } from '../explorer/FilterModal';
import { ISOLATION_OPTIONS, PRICE_RANGES } from '../explorer/exploreConstants';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const base = {
  visible: true,
  onClose: jest.fn(),
  tempPriceRange: PRICE_RANGES[0],
  onChangePriceRange: jest.fn(),
  tempIsolation: ISOLATION_OPTIONS[0],
  onChangeIsolation: jest.fn(),
  onClear: jest.fn(),
  onApply: jest.fn(),
};

describe('FilterModal: comodidades e data', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sem as props novas continua igual (só preço e isolamento)', () => {
    render(<FilterModal {...base} />);
    expect(screen.queryByText('Comodidades')).toBeNull();
    expect(screen.queryByText('Disponibilidade por data')).toBeNull();
  });

  it('lista as comodidades e avisa qual foi tocada', () => {
    const onToggleAmenity = jest.fn();
    render(<FilterModal {...base} tempAmenities={['Piscina']} onToggleAmenity={onToggleAmenity} />);
    expect(screen.getByText('Comodidades')).toBeTruthy();
    fireEvent.press(screen.getByTestId('amenity-Wi-Fi'));
    expect(onToggleAmenity).toHaveBeenCalledWith('Wi-Fi');
  });

  it('a comodidade escolhida aparece marcada para o leitor de tela', () => {
    render(<FilterModal {...base} tempAmenities={['Piscina']} onToggleAmenity={jest.fn()} />);
    expect(screen.getByTestId('amenity-Piscina').props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByTestId('amenity-Lareira').props.accessibilityState).toEqual({ checked: false });
  });

  it('data: mostra o botão, e com período escolhido mostra as datas e o "Remover"', () => {
    const onPickDates = jest.fn();
    const onClearDates = jest.fn();
    const { rerender } = render(<FilterModal {...base} onPickDates={onPickDates} onClearDates={onClearDates} tempDates={null} />);
    expect(screen.getByText('Escolher entrada e saída')).toBeTruthy();
    expect(screen.queryByTestId('filter-clear-dates')).toBeNull();
    fireEvent.press(screen.getByTestId('filter-pick-dates'));
    expect(onPickDates).toHaveBeenCalled();

    rerender(<FilterModal {...base} onPickDates={onPickDates} onClearDates={onClearDates} tempDates={{ start: '2026-12-20', end: '2026-12-23' }} />);
    expect(screen.getByText('20/12/2026 → 23/12/2026')).toBeTruthy();
    fireEvent.press(screen.getByTestId('filter-clear-dates'));
    expect(onClearDates).toHaveBeenCalled();
  });
});
