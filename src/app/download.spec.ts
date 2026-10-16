import {fileName} from './download';

describe('fileName', () => {
  const date: string = new Date().toISOString().slice(0, 10);

  it('turns the project name into a slug with the date', () => {
    expect(fileName('  Sommerlager Hünxe/Wesel!  ', 'pdf')).toBe(`sommerlager-huenxe-wesel-${date}.pdf`);
    expect(fileName('', 'json')).toBe(`camp-plan-${date}.json`);
  });

  it('shortens long names at a word boundary, or hard without one', () => {
    const words: string = 'Ein sehr langer Projektname der weit über sechzig Zeichen hinausgeht';
    expect(fileName(words, 'pdf')).toBe(`ein-sehr-langer-projektname-der-weit-ueber-sechzig-zeichen-${date}.pdf`);
    expect(fileName('x'.repeat(80), 'pdf')).toBe(`${'x'.repeat(60)}-${date}.pdf`);
  });
});
