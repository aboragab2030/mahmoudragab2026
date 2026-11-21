export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

export class DriveAuthExpiredError extends Error {
  constructor(message = 'انتهت صلاحية جلسة Google Drive، يرجى تسجيل الدخول مرة أخرى.') {
    super(message);
    this.name = 'DriveAuthExpiredError';
  }
}

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const BACKUP_FOLDER_NAME = 'Barrada Eye Center Backups';

const escapeDriveQuery = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export const safeDriveWebUrl = (rawUrl?: string): string | null => {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

async function driveFetch(url: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (res.status === 401) {
    throw new DriveAuthExpiredError();
  }
  return res;
}

export async function listDriveFiles(
  accessToken: string,
  options?: { search?: string; onlyJson?: boolean; pageSize?: number },
): Promise<DriveFileItem[]> {
  const clauses: string[] = ['trashed = false'];
  if (options?.onlyJson) {
    clauses.push("(mimeType = 'application/json' or name contains '.json')");
  }
  const term = options?.search?.trim();
  if (term) {
    clauses.push(`name contains '${escapeDriveQuery(term)}'`);
  }

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
    orderBy: 'modifiedTime desc',
    pageSize: String(options?.pageSize ?? 25),
  });

  const res = await driveFetch(`${DRIVE_FILES_API}?${params.toString()}`, accessToken);
  if (!res.ok) {
    throw new Error('تعذر تحميل قائمة الملفات من Google Drive.');
  }
  const body = (await res.json()) as { files?: DriveFileItem[] };
  return Array.isArray(body.files) ? body.files : [];
}

async function findOrCreateBackupFolder(accessToken: string): Promise<string | null> {
  const q = [
    `name = '${escapeDriveQuery(BACKUP_FOLDER_NAME)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ');
  const params = new URLSearchParams({ q, fields: 'files(id)', pageSize: '1' });

  const searchRes = await driveFetch(`${DRIVE_FILES_API}?${params.toString()}`, accessToken);
  if (searchRes.ok) {
    const data = (await searchRes.json()) as { files?: Array<{ id: string }> };
    if (data.files && data.files.length > 0 && data.files[0].id) {
      return data.files[0].id;
    }
  }

  const createRes = await driveFetch(DRIVE_FILES_API, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) return null;
  const created = (await createRes.json()) as { id?: string };
  return created.id || null;
}

async function uploadMultipartToDrive(
  accessToken: string,
  metadata: Record<string, unknown>,
  contentBlob: Blob,
  contentType: string,
): Promise<DriveFileItem> {
  const boundary = `barada_drive_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart =
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n`;
  const mediaHeader = `${delimiter}Content-Type: ${contentType}\r\n\r\n`;

  const body = new Blob([metadataPart, mediaHeader, contentBlob, closeDelimiter], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const res = await driveFetch(
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink`,
    accessToken,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!res.ok) {
    throw new Error('تعذر رفع الملف إلى Google Drive.');
  }
  return (await res.json()) as DriveFileItem;
}

export async function uploadJsonBackupToDrive(
  accessToken: string,
  fileName: string,
  payload: unknown,
): Promise<DriveFileItem> {
  const sanitizedBase = (fileName || 'barada_backup').trim().replace(/[\\/:*?"<>|]/g, '_');
  const finalName = sanitizedBase.toLowerCase().endsWith('.json')
    ? sanitizedBase
    : `${sanitizedBase}.json`;
  const folderId = await findOrCreateBackupFolder(accessToken);
  const metadata: Record<string, unknown> = {
    name: finalName,
    mimeType: 'application/json',
    ...(folderId ? { parents: [folderId] } : {}),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  return uploadMultipartToDrive(accessToken, metadata, blob, 'application/json');
}

export async function uploadFileToDrive(
  accessToken: string,
  file: File,
): Promise<DriveFileItem> {
  const folderId = await findOrCreateBackupFolder(accessToken);
  const contentType = file.type || 'application/octet-stream';
  const metadata: Record<string, unknown> = {
    name: file.name,
    ...(folderId ? { parents: [folderId] } : {}),
  };
  return uploadMultipartToDrive(accessToken, metadata, file, contentType);
}

export async function downloadDriveFileBlob(accessToken: string, fileId: string): Promise<Blob> {
  const res = await driveFetch(
    `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?alt=media`,
    accessToken,
  );
  if (!res.ok) {
    throw new Error('تعذر تحميل محتوى الملف من Google Drive.');
  }
  return res.blob();
}

export async function downloadDriveFileText(accessToken: string, fileId: string): Promise<string> {
  const blob = await downloadDriveFileBlob(accessToken, fileId);
  return blob.text();
}

export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const res = await driveFetch(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}`, accessToken, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('تعذر حذف الملف من Google Drive.');
  }
}
