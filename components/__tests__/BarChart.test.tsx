import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BarChart } from '../BarChart';

const data = [
  { key: '2026-12-08', label: '08/12', value: 0 },
  { key: '2026-12-09', label: '09/12', value: 5 },
  { key: '2026-12-10', label: '10/12', value: 10 },
];

describe('BarChart', () => {
  it('uma barra por dia, com a data embaixo', () => {
    render(<BarChart title="Reservas por dia" data={data} />);
    expect(screen.getAllByTestId('bar-chart-col')).toHaveLength(3);
    expect(screen.getByText('08/12')).toBeTruthy();
    expect(screen.getByText('10/12')).toBeTruthy();
  });

  it('mostra o valor em cima das barras com valor, e nada nas zeradas', () => {
    render(<BarChart title="Reservas por dia" data={data} />);
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('usa o formatador de valor passado', () => {
    render(<BarChart title="Recebido" data={data} formatValue={(v) => `R$ ${v}`} />);
    expect(screen.getByText('R$ 10')).toBeTruthy();
  });

  it('leitor de tela recebe um resumo com todos os dias', () => {
    render(<BarChart title="Reservas por dia" data={data} />);
    const chart = screen.getByTestId('bar-chart');
    expect(chart.props.accessibilityLabel).toBe('Reservas por dia: 08/12 0, 09/12 5, 10/12 10');
  });

  it('sem nenhum valor: mostra o aviso em vez de barras', () => {
    render(<BarChart title="Reservas por dia" data={data.map((d) => ({ ...d, value: 0 }))} />);
    expect(screen.getByTestId('bar-chart-empty')).toBeTruthy();
    expect(screen.getByText('Sem movimento nos últimos 3 dias.')).toBeTruthy();
    expect(screen.queryByTestId('bar-chart')).toBeNull();
  });
});
