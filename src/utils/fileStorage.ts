const DATABASE_NAME = 'studyai-files';
const STORE_NAME = 'blobs';
const DATABASE_VERSION = 1;
const sessionFiles = new Map<string, Blob>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
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