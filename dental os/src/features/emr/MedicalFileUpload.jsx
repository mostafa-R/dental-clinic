import { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { emrApi } from './emrApi';
import { showErrorDialog } from '../ui/uiSlice';
import { useT } from '../../lib/i18n';

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.gif,.pdf';

export default function MedicalFileUpload({ onUploaded }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      dispatch(showErrorDialog({ message: t('emr.upload.tooLarge') || 'File exceeds 20 MB limit' }));
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const result = await emrApi.uploadFile(file, setProgress);
      onUploaded?.(result.file);
    } catch (err) {
      dispatch(showErrorDialog(err));
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        onChange={handleFile}
        className="hidden"
        id="medical-file-upload"
      />
      <label
        htmlFor="medical-file-upload"
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium transition dark:border-slate-600 ${
          uploading
            ? 'pointer-events-none opacity-60'
            : 'text-slate-600 hover:border-indigo-400 hover:text-indigo-600 dark:text-slate-300 dark:hover:border-indigo-400'
        }`}
      >
        {uploading ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity={0.25} />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            {progress > 0 ? `${progress}%` : (t('emr.upload.encrypting') || 'Encrypting...')}
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            {t('emr.upload.file') || 'Upload encrypted file'}
          </>
        )}
      </label>
      <span className="text-[10px] text-slate-400 dark:text-slate-500">
        {t('emr.upload.hint') || 'JPEG, PNG, WebP, PDF · Max 20 MB · AES-256-GCM encrypted'}
      </span>
    </div>
  );
}
