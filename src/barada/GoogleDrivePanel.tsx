import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudUpload,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  Folder,
  LogOut,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { exportFullBackup, restoreFullBackup } from '@/lib/backup.functions';
import {
  deleteDriveFile,
  downloadDriveFileBlob,
  downloadDriveFileText,
  DriveAuthExpiredError,
  listDriveFiles,
  safeDriveWebUrl,
  uploadFileToDrive,
  uploadJsonBackupToDrive,
  type DriveFileItem,
} from '@/lib/googleDriveApi';
import {
  clearGoogleDriveToken,
  getGoogleDriveAccessToken,
  initGoogleDriveAuth,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  type GoogleDriveUser,
} from '@/lib/googleDriveAuth';

interface GoogleDrivePanelProps {
  cardClass: string;
  inputClass: string;
  backupFileName: string;
}

const formatBytes = (rawSize?: string): string => {
  const bytes = Number(rawSize);
  if (!bytes || Number.isNaN(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const GoogleDrivePanel: React.FC<GoogleDrivePanelProps> = ({
  cardClass,
  inputClass,
  backupFileName,
}) => {
  const [needsAuth, setNeedsAuth] = useState<boolean>(() => !getGoogleDriveAccessToken());
  const [driveUser, setDriveUser] = useState<GoogleDriveUser | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyJson, setOnlyJson] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<DriveFileItem | null>(null);
  const [confirmRestoreFile, setConfirmRestoreFile] = useState<DriveFileItem | null>(null);

  const loadFiles = useCallback(
    async (explicitToken?: string) => {
      const token = explicitToken ?? getGoogleDriveAccessToken();
      if (!token) {
        setNeedsAuth(true);
        return;
      }
      setIsLoadingFiles(true);
      try {
        const items = await listDriveFiles(token, { search: searchTerm, onlyJson });
        setFiles(items);
        setNeedsAuth(false);
      } catch (err) {
        if (err instanceof DriveAuthExpiredError) {
          clearGoogleDriveToken();
          setNeedsAuth(true);
        }
        setFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'حدث خطأ أثناء تحميل ملفات Google Drive.',
        });
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [searchTerm, onlyJson],
  );

  useEffect(() => {
    const unsubscribe = initGoogleDriveAuth(
      (user, token) => {
        setDriveUser(user);
        setNeedsAuth(false);
        void loadFiles(token);
      },
      () => {
        setDriveUser(null);
        setFiles([]);
        setNeedsAuth(true);
      },
    );
    return () => unsubscribe();
  }, [loadFiles]);

  const handleGoogleLogin = async () => {
    setIsSigningIn(true);
    setFeedback(null);
    try {
      const { user, accessToken } = await signInWithGoogleDrive();
      setDriveUser(user);
      setNeedsAuth(false);
      await loadFiles(accessToken);
      setFeedback({ type: 'success', message: 'تم ربط حساب Google Drive بنجاح.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تسجيل الدخول بحساب Google.',
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    setFeedback(null);
    await signOutGoogleDrive();
    setDriveUser(null);
    setFiles([]);
    setNeedsAuth(true);
  };

  const handleBackupToDrive = async () => {
    const token = getGoogleDriveAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setIsBusy(true);
    setFeedback(null);
    try {
      const result = await exportFullBackup();
      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error });
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const baseName = (backupFileName || 'barada_backup').trim();
      const uploaded = await uploadJsonBackupToDrive(token, `${baseName}_${timestamp}`, result.data);
      setFeedback({
        type: 'success',
        message: `تم حفظ النسخة الاحتياطية "${uploaded.name}" على Google Drive بنجاح.`,
      });
      await loadFiles(token);
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        clearGoogleDriveToken();
        setNeedsAuth(true);
      }
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر حفظ النسخة الاحتياطية على Google Drive.',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleUploadLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const token = getGoogleDriveAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setIsBusy(true);
    setFeedback(null);
    try {
      const uploaded = await uploadFileToDrive(token, file);
      setFeedback({
        type: 'success',
        message: `تم رفع الملف "${uploaded.name}" إلى Google Drive بنجاح.`,
      });
      await loadFiles(token);
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        clearGoogleDriveToken();
        setNeedsAuth(true);
      }
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر رفع الملف إلى Google Drive.',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleDownloadDriveFile = async (file: DriveFileItem) => {
    const token = getGoogleDriveAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setIsBusy(true);
    setFeedback(null);
    try {
      const blob = await downloadDriveFileBlob(token, file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        clearGoogleDriveToken();
        setNeedsAuth(true);
      }
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر تنزيل الملف من Google Drive.',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const executeRestoreFromDrive = async () => {
    if (!confirmRestoreFile) return;
    const target = confirmRestoreFile;
    setConfirmRestoreFile(null);

    const token = getGoogleDriveAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setIsBusy(true);
    setFeedback(null);
    try {
      const rawText = await downloadDriveFileText(token, target.id);
      const parsed = JSON.parse(rawText);
      if (parsed?.format !== 'barrada-backup-v1') {
        setFeedback({
          type: 'error',
          message: `الملف "${target.name}" لا يطابق صيغة النسخ الاحتياطية الخاصة بالنظام.`,
        });
        return;
      }
      const result = await restoreFullBackup({ data: { backup: parsed } });
      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error });
        return;
      }
      const restored = result.data?.restored ?? {};
      const total = Object.values(restored).reduce(
        (sum: number, val) => sum + (typeof val === 'number' ? val : 0),
        0,
      );
      setFeedback({
        type: 'success',
        message: `تمت استعادة البيانات من "${target.name}" بنجاح (${total} سجل). يرجى تحديث الصفحة لعرض أحدث البيانات.`,
      });
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        clearGoogleDriveToken();
        setNeedsAuth(true);
      }
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر استعادة النسخة الاحتياطية من Google Drive.',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const executeDeleteDriveFile = async () => {
    if (!confirmDeleteFile) return;
    const target = confirmDeleteFile;
    setConfirmDeleteFile(null);

    const token = getGoogleDriveAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setIsBusy(true);
    setFeedback(null);
    try {
      await deleteDriveFile(token, target.id);
      setFiles((prev) => prev.filter((item) => item.id !== target.id));
      setFeedback({
        type: 'success',
        message: `تم حذف الملف "${target.name}" من Google Drive.`,
      });
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        clearGoogleDriveToken();
        setNeedsAuth(true);
      }
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر حذف الملف من Google Drive.',
      });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className={cardClass}>
      {confirmDeleteFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full p-8 text-center border border-gray-100">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h4 className="text-xl font-black text-gray-900 mb-3">تأكيد حذف الملف من Google Drive</h4>
            <p className="text-sm text-gray-600 mb-6">
              هل أنت متأكد من حذف الملف <span className="font-bold text-red-600">"{confirmDeleteFile.name}"</span> نهائياً من Google Drive؟ لا يمكن التراجع عن هذه العملية.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={executeDeleteDriveFile}
                className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-all"
              >
                تأكيد الحذف
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteFile(null)}
                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200 transition-all"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRestoreFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full p-8 text-center border border-gray-100">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <RotateCcw size={32} />
            </div>
            <h4 className="text-xl font-black text-gray-900 mb-3">تأكيد استعادة النسخة الاحتياطية</h4>
            <p className="text-sm text-gray-600 mb-6">
              سيتم استعادة بيانات النظام من الملف <span className="font-bold text-blue-600">"{confirmRestoreFile.name}"</span> الموجود على Google Drive. هل تريد المتابعة؟
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={executeRestoreFromDrive}
                className="flex-1 bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition-all"
              >
                تأكيد الاستعادة
              </button>
              <button
                type="button"
                onClick={() => setConfirmRestoreFile(null)}
                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200 transition-all"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <Cloud size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">التكامل مع Google Drive</h3>
            <p className="text-xs text-gray-500">
              تصفح ملفات Google Drive وحفظ النسخ الاحتياطية واستعادتها مباشرة من السحابة.
            </p>
          </div>
        </div>

        {!needsAuth && driveUser && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
              {driveUser.email || driveUser.displayName || 'حساب Google متصل'}
            </span>
            <button
              type="button"
              onClick={handleGoogleLogout}
              className="text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all"
            >
              <LogOut size={14} /> فصل الحساب
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`mb-6 p-4 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {needsAuth ? (
        <div className="bg-gray-50 border border-gray-100 rounded-3xl p-8 text-center">
          <p className="text-sm font-bold text-gray-700 mb-6">
            سجّل الدخول بحساب Google لمنح التطبيق صلاحية الوصول إلى ملفاتك والنسخ الاحتياطية على Google Drive.
          </p>
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isSigningIn}
            dir="ltr"
            className="gsi-material-button inline-flex items-center justify-center gap-3 bg-white hover:bg-gray-50 active:bg-gray-100 text-[#1f1f1f] border border-[#747775] rounded-full px-5 h-11 text-sm font-medium shadow-xs transition-all cursor-pointer disabled:opacity-60"
          >
            <div className="gsi-material-button-state" />
            <div className="gsi-material-button-content-wrapper flex items-center gap-3">
              <div className="gsi-material-button-icon w-5 h-5 shrink-0">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="block w-5 h-5">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
              </div>
              <span className="gsi-material-button-contents">
                {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
              </span>
            </div>
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleBackupToDrive}
              disabled={isBusy}
              className="bg-blue-600 text-white px-5 py-3 rounded-xl font-bold text-xs hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-60"
            >
              <CloudUpload size={16} /> حفظ نسخة احتياطية على Google Drive
            </button>

            <label className="bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all flex items-center gap-2 cursor-pointer">
              <Upload size={16} /> رفع ملف إلى Drive
              <input type="file" className="hidden" onChange={handleUploadLocalFile} disabled={isBusy} />
            </label>

            <button
              type="button"
              onClick={() => void loadFiles()}
              disabled={isLoadingFiles || isBusy}
              className="bg-gray-100 text-gray-700 px-4 py-3 rounded-xl font-bold text-xs hover:bg-gray-200 transition-all flex items-center gap-2 disabled:opacity-60"
            >
              <RefreshCw size={15} className={isLoadingFiles ? 'animate-spin' : ''} /> تحديث الملفات
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-3 text-gray-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void loadFiles();
                }}
                placeholder="ابحث باسم الملف في Google Drive..."
                className={`${inputClass} pr-10 py-2.5 text-xs`}
              />
            </div>

            <button
              type="button"
              onClick={() => setOnlyJson((prev) => !prev)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                onlyJson
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {onlyJson ? 'عرض كل الملفات' : 'ملفات النسخ الاحتياطي فقط (.json)'}
            </button>

            <button
              type="button"
              onClick={() => void loadFiles()}
              disabled={isLoadingFiles}
              className="bg-blue-50 text-blue-700 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all"
            >
              بحث
            </button>
          </div>

          <div className="border border-gray-100 rounded-2xl overflow-hidden bg-gray-50/40">
            {isLoadingFiles ? (
              <div className="p-8 text-center text-xs font-bold text-gray-500">
                جاري تحميل الملفات من Google Drive...
              </div>
            ) : files.length === 0 ? (
              <div className="p-8 text-center text-xs font-bold text-gray-400">
                لا توجد ملفات مطابقة في Google Drive.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {files.map((file) => {
                  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                  const isJson =
                    file.mimeType === 'application/json' || file.name.toLowerCase().endsWith('.json');
                  const externalUrl = safeDriveWebUrl(file.webViewLink);

                  return (
                    <div
                      key={file.id}
                      className="p-4 flex flex-wrap items-center justify-between gap-3 bg-white hover:bg-gray-50/80 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          {isFolder ? (
                            <Folder size={18} />
                          ) : isJson ? (
                            <FileJson size={18} />
                          ) : (
                            <FileText size={18} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{file.name}</p>
                          <p className="text-[11px] text-gray-400">
                            {file.modifiedTime
                              ? new Date(file.modifiedTime).toLocaleString('ar-EG')
                              : '-'}
                            {!isFolder ? ` • ${formatBytes(file.size)}` : ' • مجلد'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isJson && (
                          <button
                            type="button"
                            onClick={() => setConfirmRestoreFile(file)}
                            disabled={isBusy}
                            className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                          >
                            <RotateCcw size={13} /> استعادة
                          </button>
                        )}
                        {!isFolder && (
                          <button
                            type="button"
                            onClick={() => void handleDownloadDriveFile(file)}
                            disabled={isBusy}
                            className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                          >
                            <Download size={13} /> تنزيل
                          </button>
                        )}
                        {externalUrl && (
                          <a
                            href={externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                          >
                            <ExternalLink size={13} /> فتح
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteFile(file)}
                          disabled={isBusy}
                          className="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                        >
                          <Trash2 size={13} /> حذف
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
