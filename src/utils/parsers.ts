import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import JSZip from 'jszip';

// Disable external worker — cross-origin workers fail silently on iOS Safari.
// Running on main thread is slower but universally compatible.
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

export interface ParsedDocument {
  text: string;
  cover?: string;
}

export const parsePDF = async (file: File): Promise<ParsedDocument> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      useSystemFonts: true
    });
    
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => {
        if ('str' in item) return item.str;
        return '';
      });
      fullText += strings.join(' ') + '\n';
    }
    
    return { text: fullText };
  } catch (error) {
    console.error('PDF Parsing Error:', error);
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const parseDOCX = async (file: File): Promise<ParsedDocument> => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return { text: result.value };
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
    console.warn('Failed to extract cover art:', e);
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
    throw new Error(`No readable text found in this EPUB.`);
  }
  
  return { text: fullText, cover: coverData };
};
