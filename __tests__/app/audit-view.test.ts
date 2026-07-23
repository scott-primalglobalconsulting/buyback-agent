import { describe, it, expect } from 'vitest';
import {
  resolveAuditTitle,
  asHireRole,
  DEFAULT_AUDIT_TITLE,
} from '@/app/app/audit-view';

describe('resolveAuditTitle', () => {
  it('keeps a non-empty title, trimmed', () => {
    expect(resolveAuditTitle('  Q3 founder audit  ')).toBe('Q3 founder audit');
  });

  it('falls back to the default for empty / whitespace input', () => {
    expect(resolveAuditTitle('')).toBe(DEFAULT_AUDIT_TITLE);
    expect(resolveAuditTitle('   ')).toBe(DEFAULT_AUDIT_TITLE);
  });
});

describe('asHireRole', () => {
  it('passes through a valid HIRE_ROLES value', () => {
    expect(asHireRole('admin')).toBe('admin');
    expect(asHireRole('leadership')).toBe('leadership');
  });

  it('returns null for null, undefined, or out-of-vocab strings', () => {
    expect(asHireRole(null)).toBeNull();
    expect(asHireRole(undefined)).toBeNull();
    expect(asHireRole('')).toBeNull();
    expect(asHireRole('cfo')).toBeNull();
  });
});
