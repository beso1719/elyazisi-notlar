// PDF.js sarmalayıcı (CDN'den ES module).
import * as pdfjsLib from 'https://esm.sh/pdfjs-dist@4.8.69/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://esm.sh/pdfjs-dist@4.8.69/build/pdf.worker.mjs';

// ArrayBuffer -> pdf.js belgesi
export async function loadPdf(arrayBuffer) {
  return await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
}
