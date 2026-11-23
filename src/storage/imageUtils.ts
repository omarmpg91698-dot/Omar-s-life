import {createSimpleId} from './localStore';
import type {NoteImage} from '../types';

const MAX_DIMENSION_PX = 1024;
const TARGET_MAX_BYTES = 240 * 1024;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('مقدرناش نقرأ الصورة دي.'));
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('مقدرناش نقرأ ملف الصورة.'));
      }
    };
    reader.onerror = () => reject(new Error('حصلت مشكلة أثناء قراءة الصورة.'));
    reader.readAsDataURL(file);
  });
}

export function compressCanvasToDataUrl(
  canvas: HTMLCanvasElement,
  initialQuality = 0.8,
): string {
  let quality = initialQuality;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > TARGET_MAX_BYTES && quality > 0.45) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return dataUrl;
}

export async function compressImageFile(file: File): Promise<NoteImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('الملف المختار مش صورة صالحة.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(rawDataUrl);

  const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      id: createSimpleId(),
      dataUrl: rawDataUrl,
      name: file.name || 'صورة',
    };
  }

  ctx.drawImage(img, 0, 0, width, height);
  const compressed = compressCanvasToDataUrl(canvas, 0.8);

  return {
    id: createSimpleId(),
    dataUrl: compressed,
    name: file.name || 'صورة',
  };
}

export function captureVideoFrameToNoteImage(video: HTMLVideoElement): NoteImage {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(vw, vh));
  const width = Math.max(1, Math.round(vw * scale));
  const height = Math.max(1, Math.round(vh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('مقدرناش نجهز الصورة من الكاميرا.');
  }
  ctx.drawImage(video, 0, 0, width, height);
  const dataUrl = compressCanvasToDataUrl(canvas, 0.82);

  return {
    id: createSimpleId(),
    dataUrl,
    name: `لقطة-${new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute: '2-digit'})}`,
  };
}
