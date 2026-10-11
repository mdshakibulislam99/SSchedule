const DATABASE_NAME = 'studyai-files';
const STORE_NAME = 'blobs';
const TEXT_STORE_NAME = 'texts';
const DATABASE_VERSION = 2;
const sessionFiles = new Map<string, Blob>();
const sessionTexts = new Map<string, string>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      if (!request.result.objectStoreNames.contains(TEXT_STORE_NAME)) request.result.createObjectStore(TEXT_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveFileBlob(file: File, key: string): Promise<string> {
  // Keep the current session readable even when the browser quota rejects persistence.
  sessionFiles.set(key, file);
  if (typeof indexedDB === 'undefined') return key;

  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(file, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // The in-memory copy remains available until the page is closed.
  }
  return key;
}

export async function loadFileBlob(key: string): Promise<Blob | null> {
  const sessionFile = sessionFiles.get(key);
  if (sessionFile) return sessionFile;
  if (typeof indexedDB === 'undefined') return null;

  try {
    const database = await openDatabase();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return blob;
  } catch {
    return null;
  }
}

/**
 * Persists the FULL extracted text of a study file in IndexedDB so the
 * complete document context survives page reloads. localStorage is not
 * used for this — extracted PDFs/slides can be megabytes long.
 */
export async function saveExtractedText(key: string, text: string): Promise<string> {
  sessionTexts.set(key, text);
  if (typeof indexedDB === 'undefined') return key;

  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(TEXT_STORE_NAME, 'readwrite');
      transaction.objectStore(TEXT_STORE_NAME).put(text, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // The in-memory copy remains available until the page is closed.
  }
  return key;
}

/** Loads the full extracted text previously stored under `key`. */
export async function loadExtractedText(key: string): Promise<string | null> {
  const sessionText = sessionTexts.get(key);
  if (sessionText !== undefined) return sessionText;
  if (typeof indexedDB === 'undefined') return null;

  try {
    const database = await openDatabase();
    const text = await new Promise<string | null>((resolve, reject) => {
      const request = database.transaction(TEXT_STORE_NAME, 'readonly').objectStore(TEXT_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return text;
  } catch {
    return null;
  }
}