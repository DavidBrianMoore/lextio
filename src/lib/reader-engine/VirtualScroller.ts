import { type ContentBlock, type Annotation } from './types';
import { type ReaderSettings } from './theme';
import { predictBlockHeight, renderBlock } from './ParagraphRenderer';

interface BlockEntry {
  block: ContentBlock;
  top: number;
  height: number;
  el: HTMLElement | null;
}

export class VirtualScroller {
  private container: HTMLElement;
  private spacer: HTMLElement;
  private pool: HTMLElement[] = [];
  private entries: BlockEntry[] = [];
  private settings: ReaderSettings;
  private columnWidth: number = 0;
  private viewportHeight: number = 0;
  private scrollTop: number = 0;
  private annotations: Annotation[] = [];
  private buffer = 1200;
  private renderedRange: [number, number] = [-1, -1];
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, settings: ReaderSettings) {
    this.container = container;
    this.settings = settings;

    this.spacer = document.createElement('div');
    this.spacer.style.cssText = 'position:relative;width:100%;pointer-events:none;';
    this.container.appendChild(this.spacer);

    window.addEventListener('scroll', this._onScroll, { passive: true });
    this.resizeObserver = new ResizeObserver(() => this._onResize());
    this.resizeObserver.observe(this.container);

    this._onResize();
  }

  setBlocks(blocks: ContentBlock[]): void {
    this._clearRendered();
    this.entries = [];
    let y = 100;
    for (const block of blocks) {
      const height = predictBlockHeight(block, this.columnWidth, this.settings);
      this.entries.push({ block, top: y, height, el: null });
      y += height;
    }
    this.spacer.style.height = `${y}px`;
    this._render();
  }

  setAnnotations(annos: Annotation[]): void {
    this.annotations = annos;
    const [start, end] = this.renderedRange;
    for (let i = start; i <= end; i++) {
      if (i >= 0 && i < this.entries.length) {
        const entry = this.entries[i];
        if (entry.el) {
          const blockAnnots = this.annotations.filter(a => a.blockId === entry.block.id);
          renderBlock(entry.block, entry.el, this.columnWidth, this.settings, blockAnnots);
        }
      }
    }
  }

  scrollToBlock(blockId: string): void {
    const idx = this.entries.findIndex(e => e.block.id === blockId);
    if (idx >= 0) {
      const targetTop = Math.max(0, this.entries[idx].top - window.innerHeight / 3);
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
  }

  private _onScroll = () => {
    this.scrollTop = window.scrollY || document.documentElement.scrollTop;
    this._render();
  };

  private _onResize() {
    this.columnWidth = Math.min(window.innerWidth - 80, this.settings.columnWidth);
    this.viewportHeight = window.innerHeight;
    this._render();
  }

  private _render() {
    const top = this.scrollTop - this.buffer;
    const bottom = this.scrollTop + this.viewportHeight + this.buffer;

    let start = 0;
    while (start < this.entries.length && this.entries[start].top + this.entries[start].height < top) {
      start++;
    }

    let end = start;
    while (end < this.entries.length && this.entries[end].top < bottom) {
      end++;
    }

    const [pStart, pEnd] = this.renderedRange;
    for (let i = pStart; i <= pEnd; i++) {
      if ((i < start || i >= end) && i >= 0) this._unmount(i);
    }
    for (let i = start; i < end; i++) {
      this._mount(i);
    }
    this.renderedRange = [start, end - 1];
  }

  private _mount(i: number) {
    const entry = this.entries[i];
    if (entry.el) return;

    const el = this.pool.pop() || document.createElement('div');
    el.style.position = 'absolute';
    el.style.top = `${entry.top}px`;
    el.style.width = `${this.columnWidth}px`;
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';

    const blockAnnots = this.annotations.filter(a => a.blockId === entry.block.id);
    renderBlock(entry.block, el, this.columnWidth, this.settings, blockAnnots);

    this.container.appendChild(el);
    entry.el = el;
  }

  private _unmount(i: number) {
    const entry = this.entries[i];
    if (!entry.el) return;
    this.container.removeChild(entry.el);
    entry.el.innerHTML = '';
    this.pool.push(entry.el);
    entry.el = null;
  }

  private _clearRendered() {
    for (let i = 0; i < this.entries.length; i++) this._unmount(i);
    this.renderedRange = [-1, -1];
  }

  destroy() {
    window.removeEventListener('scroll', this._onScroll);
    this.resizeObserver.disconnect();
    this._clearRendered();
  }
}
