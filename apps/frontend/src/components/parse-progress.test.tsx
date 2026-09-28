import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParseProgress } from './parse-progress';
import type { ParseStatusResponse } from './parse-progress';

afterEach(cleanup);

describe('ParseProgress component', () => {
  it('renders null when progress is not provided', () => {
    const { container } = render(<ParseProgress progress={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders progress and steps during extraction phase', () => {
    const progress: ParseStatusResponse = {
      status: 'EXTRACTING',
      step: 1,
      totalSteps: 4,
      message: "Matn o'qildi va kontaktlar ajratilmoqda…",
      percent: 25,
    };

    render(<ParseProgress progress={progress} />);
    expect(screen.getByText('AI Rezyume tahlili')).toBeInTheDocument();
    expect(screen.getByText("Fonga o'tkazildi")).toBeInTheDocument();
    expect(screen.getByText('Bosqich 1 / 4')).toBeInTheDocument();
    expect(screen.getAllByText("Matn o'qildi va kontaktlar ajratilmoqda…").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Ko'nikmalar va texnologiyalar aniqlanmoqda…")).toBeInTheDocument();
    expect(screen.getByText("Rezyume to'liq tahlil qilindi!")).toBeInTheDocument();
  });

  it('renders completed state when analysis finishes', () => {
    const progress: ParseStatusResponse = {
      status: 'COMPLETED',
      step: 4,
      totalSteps: 4,
      message: "Rezyume to'liq tahlil qilindi!",
      percent: 100,
    };

    render(<ParseProgress progress={progress} />);
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Fonga o'tkazildi")).not.toBeInTheDocument();
  });

  it('renders error state and retry button when failed', () => {
    const handleRetry = vi.fn();
    const progress: ParseStatusResponse = {
      status: 'FAILED',
      step: 0,
      totalSteps: 4,
      message: 'Failed to parse',
      percent: 0,
      error: 'Gemini server timeout',
    };

    render(<ParseProgress progress={progress} onRetry={handleRetry} />);
    expect(screen.getByText('Gemini server timeout')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /qayta urinish/i });
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
});
