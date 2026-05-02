// Pretext Reader Engine Types

export type ContentBlockType = 'paragraph' | 'heading' | 'image' | 'blockquote' | 'hr' | 'code' | 'anchor';

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  level?: 1 | 2 | 3 | 4 | 5 | 6; // for heading
  runs?: TextRun[];                 // for paragraph, heading, blockquote
  src?: string;                     // for image (blob URL)
  alt?: string;                     // for image
  estimatedHeight?: number;         // cached by VirtualScroller
}

export interface TocEntry {
  id: string;
  label: string;
  href: string;       // chapter href
  chapterIndex: number;
  depth: number;
  children: TocEntry[];
}

export interface Chapter {
  id: string;
  href: string;
  label: string;
  blocks: ContentBlock[];
}

export interface Annotation {
  id: string;
  blockId: string;
  type: 'highlight' | 'note' | 'citation';
  color?: string;
  text: string;
  note?: string;
  startOffset?: number;
  endOffset?: number;
  createdAt: number;
}
