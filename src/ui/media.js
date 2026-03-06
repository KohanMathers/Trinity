import { getMxcObjectUrl } from '../client/matrix.js';

function toInt(v) {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function hydrateMediaIn(root) {
  if (!root) return;
  const images = Array.from(root.querySelectorAll('img[data-media-src]'));
  await Promise.all(images.map(async img => {
    if (img.dataset.mediaHydrated === '1') return;
    img.dataset.mediaHydrated = '1';

    const source = img.dataset.mediaSrc;
    if (!source) return;

    if (!source.startsWith('mxc://')) {
      img.src = source;
      return;
    }

    const width = toInt(img.dataset.mediaW);
    const height = toInt(img.dataset.mediaH);
    const method = img.dataset.mediaMethod || 'crop';
    const blobUrl = await getMxcObjectUrl(source, width, height, method);
    if (blobUrl) img.src = blobUrl;
  }));
}
