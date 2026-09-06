import { expect, it } from 'vitest';
import { parseServerArgs } from '../src/index.js';

it('parses a bounded startup tool profile', () => {
  expect(parseServerArgs(['--project','C:/Game','--tool-profile','3d'])).toEqual({project:'C:/Game',toolProfile:'3d'});
  expect(() => parseServerArgs(['--tool-profile','physics'])).toThrow('Invalid tool profile');
  expect(() => parseServerArgs(['--tool-profile'])).toThrow('--tool-profile requires a profile');
});
