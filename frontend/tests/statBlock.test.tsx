// The big-number block (components/StatBlock.tsx): label, number, unit and qualifier, in reading order.
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { StatBlock } from '../src/components/StatBlock';

describe('StatBlock', () => {
  test('shows an optional label, the number with its unit on one line, and an optional qualifier', () => {
    render(<StatBlock testId="s" label="Small for a received amount" value="0.4×" unit="its usual size" note="usual 1.4×" />);
    const block = screen.getByTestId('s');
    expect(block.querySelector('.stat-label')).toHaveTextContent('Small for a received amount');
    expect(block.querySelector('.stat-figure')).toHaveTextContent('0.4× its usual size');
    expect(block.querySelector('.stat-value')).toHaveTextContent('0.4×');
    expect(block.querySelector('.stat-unit')).toHaveTextContent('its usual size');
    expect(block.querySelector('.stat-note')).toHaveTextContent('usual 1.4×');
  });

  test('reads in order as one sentence for a screen reader: one paragraph, label then figure then note', () => {
    render(<StatBlock testId="s" label="Longer gap than usual" value="5 days" note="usual 1 hour" />);
    const block = screen.getByTestId('s');
    expect(block.tagName).toBe('P');
    expect(block.textContent).toBe('Longer gap than usual 5 days usual 1 hour');
  });

  test('leaves out the label, the unit and the qualifier when they are not given', () => {
    render(<StatBlock testId="s" value="12" />);
    const block = screen.getByTestId('s');
    expect(block.textContent).toBe('12');
    expect(block.querySelector('.stat-label, .stat-unit, .stat-note')).toBeNull();
  });

  test('is medium by default and large when asked, and takes a class', () => {
    const { rerender } = render(<StatBlock testId="s" value="1" />);
    expect(screen.getByTestId('s')).toHaveClass('stat-block', 'stat-medium');
    rerender(<StatBlock testId="s" value="1" size="large" className="extra" />);
    expect(screen.getByTestId('s')).toHaveClass('stat-large', 'extra');
    expect(screen.getByTestId('s')).not.toHaveClass('stat-medium');
  });
});
