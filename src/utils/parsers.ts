import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { logger } from './logger';

// pdfjs-dist v3: classic (non-module) worker — works on iOS 12+.
// v5's module worker (type:'module') is unreliable on iOS Safari.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;


export interface ParsedDocument {
  text: string;
  cover?: string;
}

/**
 * Clean up text artifacts from PDF/EPUB extraction
 * (Ligatures, split words, weird spacing)
 */
export const cleanupText = (text: string): string => {
  return text
    // Fix ligatures split by spaces (fi, fl, ff)
    .replace(/(\w)f\s+i(\w)/g, '$1fi$2')
    .replace(/(\w)f\s+l(\w)/g, '$1fl$2')
    .replace(/(\w)f\s+f(\w)/g, '$1ff$2')
    // Common split words
    .replace(/\bTh\se\b/g, 'The')
    .replace(/\ba\snd\b/g, 'and')
    .replace(/\be\sxempli\s+fi\s+ed\b/g, 'exemplified')
    // Handle general "f i" pattern at start of words too
    .replace(/\bf\s+i(\w)/g, 'fi$1')
    // Rejoin words split by line-end hyphens
    .replace(/(\w)-\s+(\w)/g, '$1$2')
    // Normalize spaces
    .replace(/[ \t]+/g, ' ')
    // Normalize newlines
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const parsePDF = async (file: File): Promise<ParsedDocument> => {
  logger.info(`parsePDF: reading arrayBuffer for ${file.name}`);
  try {
    const arrayBuffer = await file.arrayBuffer();
    logger.info(`parsePDF: arrayBuffer loaded (${arrayBuffer.byteLength} bytes). Initializing PDF.js...`);
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      useSystemFonts: true,
    });
    
    const pdf = await loadingTask.promise;
    logger.info(`parsePDF: PDF loaded. Pages: ${pdf.numPages}`);
    // Cap pages on mobile to avoid memory exhaustion
    const maxPages = Math.min(pdf.numPages, 100);
    let fullText = '';
    
    for (let i = 1; i <= maxPages; i++) {
      if (i % 20 === 0) logger.info(`parsePDF: Processing page ${i}/${maxPages}...`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => {
        if ('str' in item) return item.str;
        return '';
      });
      fullText += strings.join(' ') + '\n';
      // Yield to browser every 10 pages to avoid watchdog timeouts on iOS
      if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }
    
    if (pdf.numPages > maxPages) {
      fullText += `\n\n[Note: Only first ${maxPages} of ${pdf.numPages} pages imported]`;
    }
    
    return { text: cleanupText(fullText) };
  } catch (error) {
    logger.error('PDF Parsing Error:', error);
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const parseDOCX = async (file: File): Promise<ParsedDocument> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { text: result.value };
  } catch (error) {
    logger.error('DOCX Parsing Error:', error);
    throw error;
  }
};

export const parseEPUB = async (file: File): Promise<ParsedDocument> => {
  const arrayBuffer = await file.arrayBuffer();
  
  // Load EPUB as ZIP directly — most reliable method
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // Find the container.xml to locate the OPF file
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) throw new Error('Invalid EPUB: missing META-INF/container.xml');
  
  const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
  const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('Invalid EPUB: cannot find OPF path');
  
  // Parse the OPF
  const opfContent = await zip.file(opfPath)?.async('text');
  if (!opfContent) throw new Error('Invalid EPUB: cannot read OPF file');
  
  const opfDoc = new DOMParser().parseFromString(opfContent, 'text/xml');
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  
  // 1. Extract Cover Art
  let coverData: string | undefined;
  try {
    let coverHref: string | null = null;
    
    // Try EPUB 3 cover-image property
    const coverItem = opfDoc.querySelector('item[properties~="cover-image"]');
    if (coverItem) {
      coverHref = coverItem.getAttribute('href');
    } else {
      // Try EPUB 2 meta name="cover"
      const coverMeta = opfDoc.querySelector('meta[name="cover"]');
      if (coverMeta) {
        const coverId = coverMeta.getAttribute('content');
        if (coverId) {
          const item = opfDoc.getElementById(coverId);
          if (item) coverHref = item.getAttribute('href');
        }
      }
    }

    if (coverHref) {
      const fullCoverPath = opfDir + coverHref;
      // Normalize path
      const normalizedPath = fullCoverPath.replace(/[^/]+\/\.\.\//g, '');
      const coverFile = zip.file(normalizedPath) || zip.file(coverHref);
      if (coverFile) {
        const blob = await coverFile.async('blob');
        coverData = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }
    }
  } catch (e) {
    logger.warn('Failed to extract cover art:', e);
  }

  // 2. Build manifest items and spine
  const manifestItems: Record<string, string> = {};
  opfDoc.querySelectorAll('manifest item').forEach(item => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type') || '';
    if (id && href && mediaType.includes('html')) {
      manifestItems[id] = opfDir + href;
    }
  });
  
  const spineIds: string[] = [];
  opfDoc.querySelectorAll('spine itemref').forEach(ref => {
    const idref = ref.getAttribute('idref');
    if (idref) spineIds.push(idref);
  });
  
  // 3. Extract text
  const textChunks: string[] = [];
  for (const id of spineIds) {
    const href = manifestItems[id];
    if (!href) continue;
    
    const normalizedHref = href.replace(/[^/]+\/\.\.\//g, '');
    let htmlContent = await zip.file(normalizedHref)?.async('text');
    if (!htmlContent) {
      htmlContent = await zip.file(href.replace(opfDir, ''))?.async('text') || '';
    }
    
    if (!htmlContent) continue;
    
    const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
    // Remove noise elements
    doc.querySelectorAll('script, style, nav, [epub\\:type="toc"]').forEach(el => el.remove());
    
    // Use textContent (not innerText — innerText is unreliable on DOMParser docs in iOS Safari)
    const rawText = doc.body?.textContent ?? '';
    const text = rawText.replace(/\s+/g, ' ').trim();
    if (text.length > 10) {
      textChunks.push(text);
    }
  }
  
  const fullText = textChunks.join('\n\n');
  if (!fullText.trim()) {
    const err = new Error(`No readable text found in this EPUB.`);
    logger.error('EPUB Parsing Error', err);
    throw err;
  }
  
  return { text: cleanupText(fullText), cover: coverData };
};
