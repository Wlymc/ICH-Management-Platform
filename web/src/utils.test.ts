import { describe, expect, it } from 'vitest';
import { clampPage, formatYear, splitKeywords } from './utils';

describe('public frontend utilities', () => {
  it('formats optional years without producing invalid values', () => {
    expect(formatYear(2006)).toBe('2006 年');
    expect(formatYear(null)).toBe('待补充');
  });

  it('splits Chinese keyword lists', () => {
    expect(splitKeywords('陶瓷、木雕，织造;金属')).toEqual(['陶瓷', '木雕', '织造', '金属']);
  });

  it('keeps pagination inside valid bounds', () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(3, 5)).toBe(3);
  });
});
