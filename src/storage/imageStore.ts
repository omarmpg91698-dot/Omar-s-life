import {useEffect, useState} from 'react';
import type {NoteImage, NoteItem, OmarsLifeStore} from '../types';

// Images live as compressed blobs in IndexedDB ("files"), NOT inside the main
// JSON data blob (localStorage / Drive sync). The store only keeps the image
// id, so text data stays tiny no matter how many photos Omar adds.
// Backups re-embed the compressed images on export (see embedImagesIntoStore).

const DB_NAME = 'omars_life_images_v1';
const STORE_NAME = 'images';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

export async function putImageBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('put failed'));
    });
  } finally {
    db.close();
  }
}

export async function getImageBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('get failed'));
    });
  } finally {
    db.close();
  }
}

export async function deleteImageBlob(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('delete failed'));
    });
  } finally {
    db.close();
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('read failed'));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

// ---- rendering hook with a session-level object URL cache ----
const objectUrlCache = new Map<string, string>();

export function useNoteImageSrc(img: NoteImage): string | null {
  const [src, setSrc] = useState<string | null>(
    img.dataUrl || objectUrlCache.get(img.id) || null,
  );
  useEffect(() => {
    if (img.dataUrl) {
      setSrc(img.dataUrl);
      return;
    }
    const cached = objectUrlCache.get(img.id);
    if (cached) {
      setSrc(cached);
      return;
    }
    let alive = true;
    setSrc(null);
    void getImageBlob(img.id)
      .then((blob) => {
        if (!blob || !alive) return;
        const url = URL.createObjectURL(blob);
        objectUrlCache.set(img.id, url);
        setSrc(url);
      })
      .catch(() => {
        if (alive) setSrc(null);
      });
    return () => {
      alive = false;
    };
  }, [img.id, img.dataUrl]);
  return src;
}

// ---- migration: move any inline dataUrl image into IndexedDB ----
export async function migrateInlineImages(notes: NoteItem[]): Promise<NoteItem[] | null> {
  let changed = false;
  const nextNotes: NoteItem[] = [];
  for (const note of notes) {
    if (!note.images?.length) {
      nextNotes.push(note);
      continue;
    }
    let noteChanged = false;
    const nextImages: NoteImage[] = [];
    for (const img of note.images) {
      if (img.dataUrl && img.storage !== 'idb') {
        try {
          const blob = await dataUrlToBlob(img.dataUrl);
          await putImageBlob(img.id, blob);
          objectUrlCache.delete(img.id);
          nextImages.push({...img, dataUrl: '', storage: 'idb'});
          noteChanged = true;
          changed = true;
          continue;
        } catch {
          // keep inline if migration fails for this image; retry next launch
        }
      }
      nextImages.push(img);
    }
    nextNotes.push(noteChanged ? {...note, images: nextImages} : note);
  }
  return changed ? nextNotes : null;
}

// ---- backup: re-embed compressed images so exports stay complete ----
export async function embedImagesIntoStore(store: OmarsLifeStore): Promise<OmarsLifeStore> {
  let needsEmbed = false;
  for (const note of store.notes) {
    if (note.images?.some((img) => !img.dataUrl)) {
      needsEmbed = true;
      break;
    }
  }
  if (!needsEmbed) return store;

  const nextNotes: NoteItem[] = [];
  for (const note of store.notes) {
    if (!note.images?.length) {
      nextNotes.push(note);
      continue;
    }
    const nextImages: NoteImage[] = [];
    for (const img of note.images) {
      if (!img.dataUrl) {
        try {
          const blob = await getImageBlob(img.id);
          if (blob) {
            nextImages.push({...img, dataUrl: await blobToDataUrl(blob), storage: undefined});
            continue;
          }
        } catch {
          // fall through: keep the reference entry
        }
      }
      nextImages.push(img);
    }
    nextNotes.push({...note, images: nextImages});
  }
  return {...store, notes: nextNotes};
}
