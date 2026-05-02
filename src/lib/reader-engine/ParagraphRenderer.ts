import { prepare, layout } from '@chenglou/pretext';
import { type ContentBlock, type TextRun, type Annotation } from './types';
import { type ReaderSettings, fontString, headingFontString } from './theme';

const PARAGRAPH_GAP = 32;
const HEADING_GAP = 48;

interface PreparedCache {
  prepared: ReturnType<typeof prepare>;
  font: string;
}

const _preparedCache = new Map<string, PreparedCache>();

function getPrepared(blockId: string, text: string, font: string): ReturnType<typeof prepare> {
  const key = `${blockId}::${font}`;
  const cached = _preparedCache.get(key);
  if (cached && cached.font === font) return cached.prepared;
  const prepared = prepare(text, font);
  _preparedCache.set(key, { prepared, font });
  return prepared;
}

export function clearPreparedCache(): void {
  _preparedCache.clear();
}

function runsToPlainText(runs: TextRun[]): string {
  return runs.map(r => r.text).join('');
}

export function predictBlockHeight(
  block: ContentBlock,
  columnWidth: number,
  settings: ReaderSettings,
): number {
  if (block.type === 'anchor') return 0;
  if (block.type === 'hr') return 64;

  const text = runsToPlainText(block.runs ?? []);
  const font = block.type === 'heading' ? headingFontString(block.level ?? 2, settings) : fontString(settings);
  const lh = block.type === 'heading' ? Math.round(settings.fontSize * 1.4) : Math.round(settings.fontSize * settings.lineHeight);
  
  const prepared = getPrepared(block.id, text, font);
  const { height } = layout(prepared, columnWidth, lh);
  
  return height + (block.type === 'heading' ? HEADING_GAP : PARAGRAPH_GAP);
}

export function renderBlock(
  block: ContentBlock,
  el: HTMLElement,
  columnWidth: number,
  settings: ReaderSettings,
  annotations: Annotation[] = []
): number {
  el.innerHTML = '';
  el.className = `vscroll-block block-${block.type}`;
  el.setAttribute('data-block-id', block.id);

  const container = document.createElement('div');
  container.className = 'block-inner';
  el.appendChild(container);

  let inner: HTMLElement;
  if (block.type === 'heading') {
    inner = document.createElement(`h${block.level ?? 2}`);
    inner.className = 'chapter-title'; // Use AUDIRE style
  } else {
    inner = document.createElement('p');
    inner.className = 'block-paragraph';
  }
  
  container.appendChild(inner);
  renderRuns(block.runs || [], inner, annotations);

  return el.offsetHeight || 100;
}

function renderRuns(runs: TextRun[], container: HTMLElement, annotations: Annotation[]) {
  let offset = 0;
  for (const run of runs) {
    const text = run.text;
    const runEnd = offset + text.length;

    const active = annotations.filter(a => {
       const start = a.startOffset ?? 0;
       const end = a.endOffset ?? 0;
       return (start >= offset && start < runEnd) || (end > offset && end <= runEnd) || (start <= offset && end >= runEnd);
    });

    if (active.length === 0) {
      container.appendChild(document.createTextNode(text));
    } else {
      // Handle highlighting for active sentence
      const mark = document.createElement('span');
      mark.className = 'sentence active'; // Use AUDIRE active class
      mark.textContent = text;
      container.appendChild(mark);
    }
    offset = runEnd;
  }
}
