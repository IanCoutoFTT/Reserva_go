import { render, screen } from '@testing-library/react-native';

import { MonoText } from '../StyledText';

// Observação: a versão anterior deste teste usava react-test-renderer puro
// (renderer.create(...).toJSON()) e "passava" com um snapshot `null` — o
// Scheduler assíncrono do React 19 ainda não tinha commitado a árvore no
// momento do toJSON(). @testing-library/react-native usa act() internamente
// e resolve isso corretamente.
it('renders correctly', () => {
  render(<MonoText>Snapshot test!</MonoText>);

  expect(screen.getByText('Snapshot test!')).toBeTruthy();
  expect(screen.toJSON()).toMatchSnapshot();
});
