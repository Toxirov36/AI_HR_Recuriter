import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    const select = screen.getByRole('combobox', { name: 'Language' });
    expect(Array.from((select as HTMLSelectElement).options).map((option) => option.value)).toEqual(['uz', 'ru', 'en', 'tg']);
    expect((select as HTMLSelectElement).value).toBe('en');

    fireEvent.change(select, { target: { value: 'ru' } });
    await waitFor(() => expect(i18n.language).toBe('ru'));
    expect(document.documentElement.lang).toBe('ru');
  });
});
