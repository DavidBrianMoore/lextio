import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import ePub from 'epubjs';

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
  const book = ePub(arrayBuffer);
  
  // Add a timeout for book.ready to prevent infinite hangs
  const readyPromise = book.ready;
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('EPUB load timeout')), 15000)
  );

  try {
    await Promise.race([readyPromise, timeoutPromise]);
  } catch (e) {
    console.error('EPUB failed to initialize:', e);
    throw new Error('This EPUB is taking too long to load or is corrupted.');
  }
  
  let fullText = '';
  const spine = (book as any).spine;
  if (!spine || !spine.items) {
    throw new Error('EPUB spine not found');
  }

  console.log(`Starting parse for ${file.name} (${spine.items.length} items)`);
  
  const textResults: string[] = [];
  
  // Iterate through spine items sequentially to avoid memory spikes
  for (let i = 0; i < spine.items.length; i++) {
    const item = spine.items[i];
    try {
      // Some items are images or other resources, we only want text
      if (item.href.match(/\.(html|xhtml|htm|xml)/i)) {
        // Load with a per-item timeout
        const itemLoad = item.load(book.load.bind(book));
        const itemTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Item timeout')), 5000)
        );
        
        const chapter = await Promise.race([itemLoad, itemTimeout]) as string;
        if (chapter) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(chapter, 'text/html');
          
          // Better text extraction - remove scripts and styles first
          const scripts = doc.querySelectorAll('script, style');
          scripts.forEach(s => s.remove());
          
          const text = doc.body.innerText || doc.body.textContent || '';
          const cleanedText = text.trim();
          if (cleanedText.length > 20) { // Skip very small boilerplate items
            textResults.push(cleanedText);
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to parse chapter ${item.href}:`, err);
    }
  }
  
  fullText = textResults.join('\n\n');
  
  if (!fullText.trim()) {
    throw new Error('No readable text content found in this EPUB.');
  }

  console.log(`EPUB parse complete: ${fullText.length} characters extracted.`);
  return fullText;
};
