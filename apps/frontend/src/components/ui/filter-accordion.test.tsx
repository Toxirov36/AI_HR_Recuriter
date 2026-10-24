import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterAccordion } from './filter-accordion';

afterEach(cleanup);

const options = [
  { value: 'all', label: 'All stages' },
  { value: 'NEW', label: 'New' },
  { value: 'HIRED', label: 'Hired' },
];

function Harness({ onChange = vi.fn(), value = 'all' }: { onChange?: (value: string) => void; value?: string }) {
  const [current, setCurrent] = useState(value);
  return (
    <FilterAccordion
      value={current}
      options={options}
      ariaLabel="Filter by stage"
      onChange={(next) => {
        setCurrent(next);
        onChange(next);
      }}
    />
  );
}

describe('FilterAccordion', () => {
  it('opens inline in the page flow when asked, so a clipping panel cannot cut the list off', () => {
    const { container } = render(<FilterAccordion inline value="all" options={options} ariaLabel="Role" onChange={vi.fn()} />);
    expect(container.firstElementChild).not.toHaveClass('h-10');
    fireEvent.click(screen.getByRole('button', { name: 'Role' }));
    const list = screen.getByRole('listbox', { name: 'Role' });
    expect(list.closest('[data-state="open"][role="region"]')).not.toHaveClass('absolute');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('shows the selected option on the button and opens the list under it', () => {
    render(<Harness value="NEW" />);
    const trigger = screen.getByRole('button', { name: 'Filter by stage' });
    expect(trigger).toHaveTextContent('New');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const selected = screen.getByRole('option', { name: 'New' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Hired' })).toHaveAttribute('aria-selected', 'false');
  });

  it('chooses an option, reports it and closes', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Filter by stage' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Hired' }));
    expect(onChange).toHaveBeenCalledWith('HIRED');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Hired');
  });

  it('closes on Escape and on a click outside', () => {
    render(
      <>
        <Harness />
        <p>elsewhere</p>
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Filter by stage' });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByText('elsewhere'));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('has a search box that filters through the parent and keeps a fallback label', () => {
    const onSearch = vi.fn();
    render(
      <FilterAccordion
        value="gone"
        options={[{ value: 'all', label: 'All vacancies' }]}
        fallbackLabel="Old vacancy"
        ariaLabel="Filter by vacancy"
        onChange={vi.fn()}
        search={{ value: '', onChange: onSearch, placeholder: 'Search vacancies' }}
        emptyText="Nothing found"
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Filter by vacancy' });
    expect(trigger).toHaveTextContent('Old vacancy');
    fireEvent.click(trigger);
    fireEvent.change(screen.getByPlaceholderText('Search vacancies'), { target: { value: 'smm' } });
    expect(onSearch).toHaveBeenCalledWith('smm');
  });
});
