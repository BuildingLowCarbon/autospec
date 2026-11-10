const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export const spreadsheetClipboardFormats = (rows) => {
  const cells = rows.map((row) => row.map((value) => String(value ?? '')));
  const text = cells.map((row) => row.join('\t')).join('\r\n');
  const html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table><tbody>'
    + cells.map((row) => '<tr>' + row.map((value) => {
      const numeric = value.trim() !== '' && Number.isFinite(Number(value));
      return `<td${numeric ? ` x:num="${escapeHtml(value)}"` : ''}>${escapeHtml(value)}</td>`;
    }).join('') + '</tr>').join('')
    + '</tbody></table></body></html>';
  return { text, html };
};

const copyWithEvent = ({ text, html }) => {
  if (typeof document.execCommand !== 'function') return false;
  const previousFocus = document.activeElement;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.setAttribute('aria-hidden', 'true');
  const onCopy = (event) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', text);
    event.clipboardData.setData('text/html', html);
    event.preventDefault();
  };
  try {
    document.body.appendChild(textarea);
    document.addEventListener('copy', onCopy);
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.removeEventListener('copy', onCopy);
    textarea.remove();
    previousFocus?.focus?.({ preventScroll: true });
  }
};

export const copySpreadsheetRows = async (rows) => {
  const formats = spreadsheetClipboardFormats(rows);
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([formats.html], { type: 'text/html' }),
        'text/plain': new Blob([formats.text], { type: 'text/plain' }),
      })]);
      return true;
    } catch { /* Try a copy event for browsers that reject rich clipboard writes. */ }
  }
  if (copyWithEvent(formats)) return true;
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(formats.text);
    return true;
  } catch {
    return false;
  }
};
