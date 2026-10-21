import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import * as Icons from './Icons';

const names = Object.keys(Icons).filter((name) => name.endsWith('Icon'));

describe('the icons', () => {
  it('are all drawn', () => {
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      const Icon = (
        Icons as unknown as Record<
          string,
          (props: { size?: number }) => ReactElement
        >
      )[name];
      const { container } = render(<Icon size={16} />);
      expect(container.querySelector('svg')).toBeTruthy();
    }
  });

  it('take the size they are given', () => {
    const { container } = render(<Icons.MicIcon size={22} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('22');
  });
});
