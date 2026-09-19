import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiConsent, Badge } from './ui';
import { AuthPage } from './auth';
afterEach(cleanup);
describe('review interface', () => {
  it('labels evidence without a suitability score', () => {
    render(<Badge value="NOT_FOUND" />);
    expect(screen.getByText('Not found')).toBeInTheDocument();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  });
  it('requires explicit consent and explains missing configuration', () => {
    const change = vi.fn();
    render(<AiConsent checked={false} onChange={change} configured={false} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent('GEMINI_API_KEY');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(change).toHaveBeenCalledWith(true);
  });
  it('offers company registration without choosing a foreign company ID', () => {
    render(<AuthPage onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create a workspace' }));
    expect(screen.getByLabelText('Company name')).toBeRequired();
    expect(screen.queryByLabelText('Company ID')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', '12');
  });
});
