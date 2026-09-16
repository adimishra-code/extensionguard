import { describe, it, expect } from 'vitest';
import * as shared from './domain';

describe('Shared Domain Types and Exports', () => {
  it('exports domain module correctly', () => {
    expect(shared).toBeDefined();
  });

  it('validates mock extension manifest structure', () => {
    const manifest: shared.ExtensionManifest = {
      manifest_version: 3,
      name: 'Test Guard',
      version: '1.0.0',
      permissions: ['storage', 'tabs'],
      host_permissions: ['https://*/*'],
    };

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toHaveLength(2);
    expect(manifest.name).toBe('Test Guard');
  });
});
