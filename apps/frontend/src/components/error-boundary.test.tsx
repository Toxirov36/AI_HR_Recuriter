import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { changeLanguage } from '../i18n';
import { ErrorBoundary } from './error-boundary';

let shouldThrow = true;

function Bomb() {
  if (shouldThrow) throw new Error('boom');
  return <p>all good</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(async () => {
    shouldThrow = true;
    await changeLanguage('en');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await changeLanguage('uz');
  });

  it('shows a friendly message instead of a blank page', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('recovers when the user retries and the problem is gone', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('clears the error when the reset key changes', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    shouldThrow = false;
    rerender(
      <ErrorBoundary resetKey="/b">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });
});
