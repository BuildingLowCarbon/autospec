import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

test('protège la page Custom sans session', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ ok: false, error: 'Authentification requise.' }),
  });
  window.history.pushState({}, '', '/custom/test');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
});
