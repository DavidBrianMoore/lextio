/**
 * Lextio Debug API
 * 
 * This module exposes core internal functions to the window object
 * for rapid testing and automation without using the UI.
 */

import { parsePDF, parseDOCX, parseEPUB } from './parsers';

export const initDebugApi = (context: {
  library: any[];
  setLibrary: (lib: any[]) => void;
  processUrl: (url: string) => Promise<void>;
  setContent: (content: string) => void;
  setFileName: (name: string) => void;
  setLibraryView: (view: 'list' | 'grid' | 'compact') => void;
  setReaderFontSize: (size: number) => void;
  setReaderFontFamily: (font: string) => void;
  setSelectedIds: (ids: Set<string>) => void;
  deleteSelected: () => void;
  selectAll: () => void;
}) => {
  (window as any).lextio = {
    // Core Parsers
    parsers: {
      pdf: parsePDF,
      docx: parseDOCX,
      epub: parseEPUB
    },

    // Library Management
    library: {
      get: () => context.library,
      clear: () => {
        context.setLibrary([]);
        localStorage.removeItem('voice-reader-library');
        console.log('Library cleared.');
      },
      add: (entry: any) => {
        context.setLibrary([...context.library, entry]);
      }
    },

    // UI & Appearance
    ui: {
      setViewMode: (view: 'list' | 'grid' | 'compact') => {
        context.setLibraryView(view);
        console.log(`View mode set to: ${view}`);
      },
      setFontSize: (size: number) => {
        context.setReaderFontSize(size);
        console.log(`Font size set to: ${size}rem`);
      },
      setFontFamily: (font: string) => {
        context.setReaderFontFamily(font);
        console.log(`Font family set to: ${font}`);
      }
    },

    // Multi-Selection & Bulk Actions
    selection: {
      all: () => {
        context.selectAll();
        console.log('Select all toggled.');
      },
      delete: () => {
        context.deleteSelected();
        console.log('Bulk delete triggered.');
      },
      clear: () => {
        context.setSelectedIds(new Set());
        console.log('Selection cleared.');
      }
    },

    // Automation
    loadUrl: context.processUrl,
    
    // Testing Utilities
    test: {
      /**
       * Tests EPUB parsing from a URL
       */
      epub: async (url: string) => {
        console.log(`[Debug] Testing EPUB from: ${url}`);
        const start = performance.now();
        try {
          await context.processUrl(url);
          const end = performance.now();
          console.log(`[Debug] Test Success! Took ${Math.round(end - start)}ms`);
        } catch (e) {
          console.error(`[Debug] Test Failed:`, e);
        }
      }
    },

    // Version Info
    version: (window as any).__APP_VERSION__ || 'development'
  };

  console.log('%cLextio Debug API Expanded', 'color: #81e6d9; font-weight: bold; font-size: 1.2rem;');
  console.log('Access via window.lextio');
};
