import { R2_WORKER_URL } from '../constants';

interface UploadUrlResponse {
  url: string;
  key: string;
}

interface DownloadUrlResponse {
  url: string;
}

async function r2Fetch<T>(
  path: string,
  body: Record<string, unknown>,
  accessToken: string,
  method: 'POST' | 'DELETE' = 'POST',
): Promise<T> {
  const res = await fetch(`${R2_WORKER_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error(`R2 ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function getUploadUrl(
  key: string,
  contentType: string,
  contentLength: number,
  accessToken: string,
): Promise<string> {
  const data = await r2Fetch<UploadUrlResponse>(
    '/upload-url',
    { key, contentType, contentLength },
    accessToken,
  );
  return data.url;
}

export async function getDownloadUrl(key: string, accessToken: string): Promise<string> {
  const data = await r2Fetch<DownloadUrlResponse>('/download-url', { key }, accessToken);
  return data.url;
}

export async function deleteR2File(key: string, accessToken: string): Promise<void> {
  // The worker routes /file only on the DELETE method.
  // A 404 means the object is already gone — treat that as success (R2-2).
  try {
    await r2Fetch<{ success: boolean }>('/file', { key }, accessToken, 'DELETE');
  } catch (e) {
    if (e instanceof Error && /\(404\)/.test(e.message)) return;
    throw e;
  }
}

// Reads a local file URI into a Blob so we know its real byte size
// before requesting the presigned upload URL.
export async function fetchFileBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}

export async function uploadBlobToR2(
  presignedUrl: string,
  blob: Blob,
  contentType: string,
): Promise<void> {
  const uploadRes = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${uploadRes.status}`);
  }
}
