import { describe, expect, it } from 'vitest';
import { isImage, languageFor } from './languages.js';

describe('languageFor', () => {
  it.each([
    ['index.ts', 'typescript'],
    ['App.TSX', 'typescript'],
    ['main.py', 'python'],
    ['Dockerfile', 'dockerfile'],
    ['Makefile', 'makefile'],
    ['config.yml', 'yaml'],
    ['page.vue', 'xml'],
  ])('%s -> %s', (file, language) => {
    expect(languageFor(file)).toBe(language);
  });

  it('returns null for unknown or extension-less files', () => {
    expect(languageFor('LICENSE')).toBeNull();
    expect(languageFor('data.xyz')).toBeNull();
    expect(languageFor('.env')).toBeNull();
  });
});

describe('isImage', () => {
  it('recognises image extensions', () => {
    expect(isImage('logo.PNG')).toBe(true);
    expect(isImage('icon.svg')).toBe(true);
    expect(isImage('readme.md')).toBe(false);
  });
});
