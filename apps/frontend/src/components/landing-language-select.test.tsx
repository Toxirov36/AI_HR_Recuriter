import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import i18n, { changeLanguage } from '../i18n';
import { LandingLanguageSelect } from './landing-language-select';

describe('LandingLanguageSelect', () => {
  afterEach(async () => {
    cleanup();
    await changeLanguage('uz');
  });

  it('lists the four languages and switches the interface language', async () => {
    await changeLanguage('en');
    render(<LandingLanguageSelect />);
    const trigger = screen.getByRole('button', { name: 'Language' });
    expect(trigger).toHaveTextContent('English');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    const list = screen.getByRole('listbox', { name: 'Language' });
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(4);
    expect(options.find((option) => option.getAttribute('aria-selected') === 'true')).toHaveTextContent('English');

    fireEvent.click(options[1]);
    await waitFor(() => expect(i18n.language).toBe('ru'));
    expect(document.documentElement.lang).toBe('ru');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('works from the keyboard and closes on Escape or an outside click', async () => {
    await changeLanguage('uz');
    render(<LandingLanguageSelect />);
    const trigger = screen.getByRole('button', { name: /Til|Language/ });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    await waitFor(() => expect(i18n.language).toBe('ru'));

    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });
});
