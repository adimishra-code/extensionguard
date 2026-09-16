import { describe, it, expect } from 'vitest';
import { cn, getSeverityColor, getSeverityBadge, getCategoryLabel, truncate } from './utils';

describe('Frontend Utils', () => {
  it('combines class names correctly with cn', () => {
    expect(cn('btn', 'btn-primary')).toBe('btn btn-primary');
    expect(cn('p-4', undefined, 'text-red-500')).toBe('p-4 text-red-500');
  });

  it('returns severity color class for valid severity', () => {
    expect(getSeverityColor('critical')).toContain('danger');
    expect(getSeverityColor('medium')).toContain('warning');
    expect(getSeverityColor('unknown')).toBe(getSeverityColor('info'));
  });

  it('returns severity badge class', () => {
    expect(getSeverityBadge('critical')).toBe('badge-critical');
    expect(getSeverityBadge('low')).toBe('badge-low');
  });

  it('returns category labels', () => {
    expect(getCategoryLabel('permission_risk')).toBe('Permission Risk');
    expect(getCategoryLabel('supply_chain')).toBe('Supply Chain');
    expect(getCategoryLabel('custom_cat')).toBe('custom_cat');
  });

  it('truncates strings exceeding length', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
    expect(truncate('hello', 10)).toBe('hello');
  });
});
