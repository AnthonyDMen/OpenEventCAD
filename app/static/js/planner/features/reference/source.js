/** Browser file ingestion for raster and PDF reference images. */

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('The file could not be read.')); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); });
}

export function loadReferenceImage(dataUrl) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('The selected image could not be loaded.')); image.src = dataUrl; });
}

export async function referenceFileDataUrl(file, pdfjsLib) {
  if (!file) throw new Error('Choose a reference image or PDF.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose a reference image or PDF smaller than 8 MB.');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (!isPdf) {
    if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Use a PNG, JPEG, or PDF reference image.');
    const dataUrl = await readFileAsDataUrl(file); const image = await loadReferenceImage(dataUrl);
    return { dataUrl, name: file.name || 'Reference image', sourceType: 'image', width: image.width, height: image.height, scaleInfo: null };
  }
  if (!pdfjsLib) throw new Error('PDF support could not be loaded.');
  try {
    const pdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await pdfDocument.getPage(1); const base = page.getViewport({ scale: 1 }); const scale = Math.min(2, 1800 / Math.max(base.width, base.height)); const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return { dataUrl: canvas.toDataURL('image/jpeg', .86), name: file.name || 'Reference PDF', sourceType: 'pdf', width: canvas.width, height: canvas.height, scaleInfo: null };
  } catch { throw new Error('The PDF could not be rendered. Use an unlocked, readable PDF.'); }
}
