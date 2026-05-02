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
  await book.ready;
  
  let fullText = '';
  const spine = book.spine as any;
  
  // Iterate through chapters
  for (const item of spine.items) {
    const chapter = await item.load(book.load.bind(book));
    const parser = new DOMParser();
    const doc = parser.parseFromString(chapter as string, 'text/html');
    fullText += doc.body.innerText + '\n';
  }
  
  return fullText;
};
