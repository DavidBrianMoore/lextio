import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import JSZip from 'jszip';

// Initialize PDF.js worker using the version from the package
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const parsePDF = async (file: File): Promise<string> => {
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
    
    return fullText;
  } catch (error) {
    console.error('PDF Parsing Error:', error);
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const parseDOCX = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
};

export const parseEPUB = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  
  // Load EPUB as ZIP directly — most reliable method
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // Find the container.xml to locate the OPF file
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) throw new Error('Invalid EPUB: missing META-INF/container.xml');
  
  const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
  const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('Invalid EPUB: cannot find OPF path');
  
  // Parse the OPF to get spine order
  const opfContent = await zip.file(opfPath)?.async('text');
  if (!opfContent) throw new Error('Invalid EPUB: cannot read OPF file');
  
  const opfDoc = new DOMParser().parseFromString(opfContent, 'text/xml');
  
  // Build a map of manifest items: id -> href
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  const manifestItems: Record<string, string> = {};
  opfDoc.querySelectorAll('manifest item').forEach(item => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type') || '';
    if (id && href && mediaType.includes('html')) {
      manifestItems[id] = opfDir + href;
    }
  });
  
  // Get spine order
  const spineIds: string[] = [];
  opfDoc.querySelectorAll('spine itemref').forEach(ref => {
    const idref = ref.getAttribute('idref');
    if (idref) spineIds.push(idref);
  });
  
  console.log(`EPUB: found ${spineIds.length} spine items`);
  
  // Extract text from each spine item in order
  const textChunks: string[] = [];
  for (const id of spineIds) {
    const href = manifestItems[id];
    if (!href) continue;
    
    // Normalize the path (handle ../ etc)
    const normalizedHref = href.replace(/[^/]+\/\.\.\//g, '');
    
    const rawHtml = await zip.file(normalizedHref)?.async('text');
    if (!rawHtml) {
      // Try without the opfDir prefix
      const fallback = await zip.file(href.replace(opfDir, ''))?.async('text');
      if (!fallback) continue;
    }
    
    const htmlContent = rawHtml || await zip.file(href.replace(opfDir, ''))?.async('text') || '';
    if (!htmlContent) continue;
    
    const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
    // Remove non-content elements
    doc.querySelectorAll('script, style, nav, [epub\\:type="toc"]').forEach(el => el.remove());
    
    const text = (doc.body?.innerText || doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length > 10) {
      textChunks.push(text);
    }
  }
  
  const fullText = textChunks.join('\n\n');
  
  if (!fullText.trim()) {
    throw new Error(`No readable text found. Spine had ${spineIds.length} items but none yielded text.`);
  }
  
  console.log(`EPUB parse complete: ${fullText.length} chars from ${textChunks.length} chapters`);
  return fullText;
};
