import { describe, expect, it } from 'vitest';
import { extractRelativePath } from './diff';
import { WORK_DIR } from '@bolt/core/constants/workspace';

describe('Diff', () => {
  it('should strip out Work_dir', () => {
    const filePath = `${WORK_DIR}/index.js`;
    const result = extractRelativePath(filePath);
    expect(result).toBe('index.js');
  });
});
