/**
 * Google Drive v3 API operations, built on the existing
 * authorized Drive connection (`googleDrive.ts` →
 * `getDriveAccessToken`).
 *
 * Every operation returns structured errors instead of
 * swallowing failures: revoked permissions, expired tokens,
 * network errors, rate limits and insufficient storage each
 * map to their own error class so callers (and tests) can
 * react precisely.
 *
 * `createDriveApi` accepts injected `fetch` and token
 * providers so unit tests run against a fake API without
 * touching real Drive accounts.
 */

import { GoogleApiError, GoogleAuthError } from './googleCalendar';
import { getDriveAccessToken } from './googleDrive';

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

/** A structured Drive API failure. */
export class DriveApiError extends GoogleApiError {
  reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(status, message);
    this.name = 'DriveApiError';
    this.reason = reason;
  }
}

/** Network failure (offline, DNS, CORS, fetch rejected). */
export class DriveNetworkError extends DriveApiError {
  constructor(message: string) {
    super(0, message);
    this.name = 'DriveNetworkError';
  }
}

/** 401 — the access token expired or was revoked. */
export class DriveAuthError extends DriveApiError {
  constructor(message: string) {
    super(401, message);
    this.name = 'DriveAuthError';
  }
}

/** 403 — permission revoked / not granted for this file. */
export class DrivePermissionError extends DriveApiError {
  constructor(message: string, reason?: string) {
    super(403, message, reason);
    this.name = 'DrivePermissionError';
  }
}

/** 403 accessNotConfigured — the Drive API is disabled in GCP. */
export class DriveApiNotEnabledError extends DriveApiError {
  constructor(message: string, reason?: string) {
    super(403, message, reason);
    this.name = 'DriveApiNotEnabledError';
  }
}

/** 403 quotaExceeded — the user is out of Drive storage. */
export class DriveQuotaError extends DriveApiError {
  constructor(message: string, reason?: string) {
    super(403, message, reason);
    this.name = 'DriveQuotaError';
  }
}

/** 429 — rate limited; safe to retry after the delay. */
export class DriveRateLimitError extends DriveApiError {
  retryAfterSeconds: number;
  constructor(message: string, reason?: string, retryAfterSeconds = 1) {
    super(429, message, reason);
    this.name = 'DriveRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** 404 — file or folder id no longer exists. */
export class DriveNotFoundError extends DriveApiError {
  constructor(message: string, reason?: string) {
    super(404, message, reason);
    this.name = 'DriveNotFoundError';
  }
}

/** A file/folder exists where a folder was expected. */
export class DriveInvalidFolderError extends DriveApiError {
  constructor(message: string) {
    super(400, message);
    this.name = 'DriveInvalidFolderError';
  }
}

export interface DriveFileList {
  files: Array<{
    id: string;
    name: string;
    mimeType?: string;
    webViewLink?: string;
    size?: string;
  }>;
  nextPageToken?: string;
}

export interface DriveApi {
  listFiles(
    q?: string,
    opts?: { pageSize?: number; pageToken?: string },
  ): Promise<DriveFileList>;
  getFile(fileId: string): Promise<DriveFileList['files'][number]>;
  downloadText(fileId: string): Promise<string>;
  createFolder(name: string, parentId: string): Promise<DriveFileList['files'][number]>;
  uploadJson(
    name: string,
    parentId: string,
    content: unknown,
  ): Promise<DriveFileList['files'][number]>;
  updateJson(
    fileId: string,
    content: unknown,
    opts?: { name?: string; addParents?: string[]; removeParents?: string[] },
  ): Promise<DriveFileList['files'][number]>;
  moveFile(
    fileId: string,
    addParents: string[],
    removeParents: string[],
  ): Promise<DriveFileList['files'][number]>;
  deleteFile(fileId: string): Promise<void>;
}

const MAX_RATE_LIMIT_RETRIES = 2;

function parseDriveError(res: Response, bodyText: string): DriveApiError {
  let message = res.statusText || 'Google Drive request failed';
  let reason: string | undefined;
  try {
    const body = JSON.parse(bodyText);
    message = body?.error?.message || message;
    reason = body?.error?.errors?.[0]?.reason;
  } catch {
    // Non-JSON error body — keep the status text.
  }
  switch (res.status) {
    case 401:
      return new DriveAuthError(message);
    case 403:
      if (reason === 'accessNotConfigured') return new DriveApiNotEnabledError(message, reason);
      if (reason === 'quotaExceeded' || reason === 'storageQuotaExceeded')
        return new DriveQuotaError(message, reason);
      return new DrivePermissionError(message, reason);
    case 404:
      return new DriveNotFoundError(message, reason);
    case 429: {
      const retryAfter = Number(res.headers?.get?.('Retry-After')) || 1;
      return new DriveRateLimitError(message, reason, Number.isFinite(retryAfter) ? retryAfter : 1);
    }
    default:
      return new DriveApiError(res.status, message, reason);
  }
}

async function request(
  fetchImpl: typeof fetch,
  getToken: () => Promise<string>,
  url: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<Response> {
  let res: Response;
  try {
    const token = await getToken();
    res = await fetchImpl(url, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    });
  } catch (err: any) {
    // Auth failures must surface as auth errors (the user needs to
    // reconnect Drive) — never mislabeled as network failures, which
    // the sync layer would treat as retryable-offline.
    if (err instanceof DriveApiError) throw err;
    if (err instanceof GoogleAuthError) {
      throw new DriveAuthError(
        `Google Drive authorization expired or unavailable: ${err.message}`,
      );
    }
    throw new DriveNetworkError(
      err?.message === 'Failed to fetch' || err instanceof TypeError
        ? 'Network request failed — check your connection.'
        : String(err?.message || err),
    );
  }

  if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
    const retryAfter = Number(res.headers?.get?.('Retry-After')) || 1;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(retryAfter, 8) * 1000),
    );
    return request(fetchImpl, getToken, url, init, attempt + 1);
  }
  return res;
}

async function expectOk(
  res: Response,
  successStatus = 200,
): Promise<void> {
  if (res.ok || res.status === successStatus) return;
  const text = await res.text().catch(() => '');
  throw parseDriveError(res, text);
}

function multipartRelated(
  metadata: unknown,
  media: string,
  mediaType = 'application/json',
): { body: string; contentType: string } {
  const boundary = `-------sschedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const delimiter = `--${boundary}`;
  const body = [
    delimiter,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    delimiter,
    `Content-Type: ${mediaType}`,
    '',
    media,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return { body, contentType: `multipart/related; boundary="${boundary}"` };
}

/**
 * Creates a Drive API client. Both the fetch implementation
 * and the token provider are injectable for tests.
 */
export function createDriveApi(
  fetchImpl: typeof fetch = fetch,
  getToken: () => Promise<string> = getDriveAccessToken,
): DriveApi {
  const BASE = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

  return {
    async listFiles(q, opts) {
      const params = new URLSearchParams();
      params.set('fields', 'files(id,name,mimeType,webViewLink,size),nextPageToken');
      if (q) params.set('q', q);
      if (opts?.pageSize) params.set('pageSize', String(opts.pageSize));
      if (opts?.pageToken) params.set('pageToken', opts.pageToken);
      const res = await request(fetchImpl, getToken, `${BASE}/files?${params.toString()}`);
      await expectOk(res);
      return res.json() as Promise<DriveFileList>;
    },

    async getFile(fileId) {
      const params = new URLSearchParams();
      params.set('fields', 'id,name,mimeType,webViewLink,size');
      const res = await request(fetchImpl, getToken, `${BASE}/files/${encodeURIComponent(fileId)}?${params.toString()}`);
      await expectOk(res);
      return res.json() as Promise<DriveFileList['files'][number]>;
    },

    async downloadText(fileId) {
      const res = await request(
        fetchImpl,
        getToken,
        `${BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
      );
      await expectOk(res);
      return res.text();
    },

    async createFolder(name, parentId) {
      const res = await request(fetchImpl, getToken, `${BASE}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: DRIVE_FOLDER_MIME, parents: [parentId] }),
      });
      await expectOk(res, 200);
      return res.json() as Promise<DriveFileList['files'][number]>;
    },

    async uploadJson(name, parentId, content) {
      const { body, contentType } = multipartRelated(
        { name, mimeType: 'application/json', parents: [parentId] },
        JSON.stringify(content),
      );
      const res = await request(fetchImpl, getToken, `${UPLOAD}?uploadType=multipart`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
      });
      await expectOk(res, 200);
      return res.json() as Promise<DriveFileList['files'][number]>;
    },

    async updateJson(fileId, content, opts) {
      const params = new URLSearchParams();
      params.set('uploadType', 'multipart');
      if (opts?.addParents?.length) params.set('addParents', opts.addParents.join(','));
      if (opts?.removeParents?.length) params.set('removeParents', opts.removeParents.join(','));
      const metadata: Record<string, unknown> = {};
      if (opts?.name) metadata.name = opts.name;
      const { body, contentType } = multipartRelated(metadata, JSON.stringify(content));
      const res = await request(
        fetchImpl,
        getToken,
        `${UPLOAD}/${encodeURIComponent(fileId)}?${params.toString()}`,
        { method: 'PATCH', headers: { 'Content-Type': contentType }, body },
      );
      await expectOk(res, 200);
      return res.json() as Promise<DriveFileList['files'][number]>;
    },

    async moveFile(fileId, addParents, removeParents) {
      const params = new URLSearchParams();
      if (addParents.length) params.set('addParents', addParents.join(','));
      if (removeParents.length) params.set('removeParents', removeParents.join(','));
      const res = await request(
        fetchImpl,
        getToken,
        `${BASE}/files/${encodeURIComponent(fileId)}?${params.toString()}`,
        { method: 'PATCH' },
      );
      await expectOk(res);
      return res.json() as Promise<DriveFileList['files'][number]>;
    },

    async deleteFile(fileId) {
      const res = await request(
        fetchImpl,
        getToken,
        `${BASE}/files/${encodeURIComponent(fileId)}`,
        { method: 'DELETE' },
      );
      // 204 No Content is the success status for deletes.
      await expectOk(res, 204);
    },
  };
}

/** The live Drive API client for the app. */
export const driveApi: DriveApi = createDriveApi();
