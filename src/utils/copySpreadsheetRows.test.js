import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copySpreadsheetRows, spreadsheetClipboardFormats } from './copySpreadsheetRows';

const rows = [['0.301524', '0.339446'], ['0.083333', ''], ['', '']];
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand);
  else delete document.execCommand;
});

describe('copie de résultats pour Excel', () => {
  it('fournit un tableau à deux colonnes avec cellules et lignes vides préservées', () => {
    const { text, html } = spreadsheetClipboardFormats(rows);
    expect(text).toBe('0.301524\t0.339446\r\n0.083333\t\r\n\t');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('tr')).toHaveLength(3);
    expect([...doc.querySelectorAll('tr')].every((row) => row.children.length === 2)).toBe(true);
    expect(doc.querySelector('td').getAttribute('x:num')).toBe('0.301524');
    expect(doc.querySelectorAll('td')[3].textContent).toBe('');
    expect(text).not.toContain(',');
    expect(spreadsheetClipboardFormats([['<b>', '&']]).html).toContain('&lt;b&gt;');
  });

  it('écrit simultanément les formats tableau HTML et texte dans le presse-papiers', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { write } });
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('ClipboardItem', class { constructor(data) { this.data = data; } });
    expect(await copySpreadsheetRows(rows)).toBe(true);
    const item = write.mock.calls[0][0][0];
    expect(await item.data['text/plain'].text()).toBe(spreadsheetClipboardFormats(rows).text);
    expect(await item.data['text/html'].text()).toBe(spreadsheetClipboardFormats(rows).html);
  });

  it('utilise un événement de copie avec tableau si l’écriture riche est refusée', async () => {
    vi.stubGlobal('navigator', { clipboard: { write: vi.fn().mockRejectedValue(new Error('Permission refusée')) } });
    vi.stubGlobal('ClipboardItem', class {});
    const setData = vi.fn();
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => {
      const event = new Event('copy', { cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { setData } });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    }) });
    expect(await copySpreadsheetRows(rows)).toBe(true);
    expect(setData).toHaveBeenCalledWith('text/html', spreadsheetClipboardFormats(rows).html);
    expect(setData).toHaveBeenCalledWith('text/plain', spreadsheetClipboardFormats(rows).text);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('garde une copie texte tabulée pour les navigateurs sans copie riche', async () => {
    vi.stubGlobal('ClipboardItem', undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copySpreadsheetRows(rows)).toBe(true);
    expect(writeText).toHaveBeenCalledWith(spreadsheetClipboardFormats(rows).text);
  });

  it('signale un échec si aucune méthode de copie ne fonctionne', async () => {
    vi.stubGlobal('ClipboardItem', undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Non disponible')) } });
    expect(await copySpreadsheetRows(rows)).toBe(false);
  });
});
