'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Bold } from 'lucide-react';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** El formato persistido es Markdown mínimo: sólo **negrita**. Es seguro y compatible con notas ya existentes. */
function noteToEditorHtml(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as HTMLElement;
  if (element.tagName === 'BR') return '\n';
  const content = Array.from(element.childNodes).map(nodeToMarkdown).join('');
  if (element.tagName === 'STRONG' || element.tagName === 'B') return `**${content}**`;
  return ['DIV', 'P'].includes(element.tagName) ? `${content}\n` : content;
}

function editorToNote(editor: HTMLElement): string {
  return Array.from(editor.childNodes).map(nodeToMarkdown).join('').replace(/\n+$/, '');
}

function selectionIsBold(editor: HTMLElement): boolean {
  const node = window.getSelection()?.anchorNode;
  let current: Node | null = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentNode ?? null;
  while (current && current !== editor) {
    if (current instanceof HTMLElement && ['STRONG', 'B'].includes(current.tagName)) return true;
    current = current.parentNode;
  }
  return false;
}

export function StaffNoteEditor({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const [boldActive, setBoldActive] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editorToNote(editor) !== value) editor.innerHTML = noteToEditorHtml(value);
  }, [value]);

  const syncValue = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(editorToNote(editor));
    setBoldActive(selectionIsBold(editor));
  };

  const toggleBold = () => {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    editor.focus();
    document.execCommand('bold');
    syncValue();
  };

  return <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm transition focus-within:border-foreground/40 focus-within:ring-2 focus-within:ring-foreground/10">
    <div className="flex items-center gap-1 border-b border-border bg-muted/50 px-2 py-1.5">
      <button type="button" aria-label="Aplicar o quitar negrita" aria-pressed={boldActive} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={toggleBold} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:cursor-not-allowed disabled:opacity-50 ${boldActive ? 'bg-zinc-950 text-white' : 'text-zinc-700 hover:bg-zinc-200'}`}>
        <Bold className="h-4 w-4" aria-hidden="true" />
      </button>
      <span id={helpId} className="text-xs text-muted-foreground">Seleccioná el texto y elegí negrita.</span>
    </div>
    <div className="relative">
      {!value && <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">Ej.: Antes del vals, coordinación avisa a DJ y foto; despejar la pista.</span>}
      <div ref={editorRef} contentEditable={!disabled} role="textbox" aria-label="Nota para staff" aria-multiline="true" aria-describedby={helpId} suppressContentEditableWarning onInput={syncValue} onKeyUp={() => editorRef.current && setBoldActive(selectionIsBold(editorRef.current))} onMouseUp={() => editorRef.current && setBoldActive(selectionIsBold(editorRef.current))} onPaste={(event) => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); }} className="min-h-24 w-full whitespace-pre-wrap px-3 py-2.5 text-sm text-foreground outline-none empty:before:content-[''] disabled:cursor-not-allowed" />
    </div>
  </div>;
}
