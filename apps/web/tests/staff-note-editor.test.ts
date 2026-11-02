// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { editorToNote, noteToEditorHtml, StaffNoteEditor } from '../src/features/events/staff-note-editor';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function fromHtml(html: string): string {
  const editor = document.createElement('div');
  editor.innerHTML = html;
  return editorToNote(editor);
}

describe('staff note editor line breaks', () => {
  it('saves Enter before a new block after inline text and keeps bold formatting on reload', () => {
    const saved = fromHtml('RECEPCIÓN: 90 triples de JyQ<div>- <strong>celíaca (MESA 6):</strong> 2 brochetas</div>');

    expect(saved).toBe('RECEPCIÓN: 90 triples de JyQ\n- **celíaca (MESA 6):** 2 brochetas');
    const reloaded = document.createElement('div');
    reloaded.innerHTML = noteToEditorHtml(saved);
    expect(editorToNote(reloaded)).toBe(saved);
  });

  it('preserves a blank paragraph between browser-generated blocks', () => {
    expect(fromHtml('<div><strong>RECEPCIÓN:</strong> JyQ</div><div><br></div><div>- <strong>celíaca:</strong> 1 cazuela</div>'))
      .toBe('**RECEPCIÓN:** JyQ\n\n- **celíaca:** 1 cazuela');
  });

  it('keeps an Enter at the end when the browser leaves an empty block', () => {
    expect(fromHtml('<div>JyQ</div><div><br></div>')).toBe('JyQ\n');
    expect(fromHtml('<br>')).toBe('');
  });

  it('preserves explicit line breaks and paragraph tags', () => {
    expect(fromHtml('<p>Primera línea</p><p>Segunda línea</p>')).toBe('Primera línea\nSegunda línea');
    expect(fromHtml('Primera<br><br><strong>Segunda</strong>')).toBe('Primera\n\n**Segunda**');
    expect(fromHtml('Primera<span><br></span>Segunda')).toBe('Primera\nSegunda');
  });

  it('loads notes with Windows line breaks as separate lines', () => {
    expect(fromHtml(noteToEditorHtml('Recepción\r\n- celíaca'))).toBe('Recepción\n- celíaca');
    const editor = document.createElement('div');
    editor.textContent = 'Recepción\r\n- celíaca';
    expect(editorToNote(editor)).toBe('Recepción\n- celíaca');
  });

  it('keeps the new line after the editor sends its value and receives it back', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    let saved = '';
    const render = (value: string) => createElement(StaffNoteEditor, { value, onChange: (next: string) => { saved = next; } });

    try {
      await act(async () => { root.render(render('RECEPCIÓN: JyQ- **celíaca**')); });
      const editor = host.querySelector('[contenteditable="true"]') as HTMLElement;
      await act(async () => {
        editor.innerHTML = 'RECEPCIÓN: JyQ<div>- <strong>celíaca</strong></div>';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      });

      expect(saved).toBe('RECEPCIÓN: JyQ\n- **celíaca**');
      await act(async () => { root.render(render(saved)); });
      expect(editorToNote(editor)).toBe(saved);
      expect(editor.innerHTML).toContain('<div>- <strong>celíaca</strong></div>');
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
    }
  });
});
