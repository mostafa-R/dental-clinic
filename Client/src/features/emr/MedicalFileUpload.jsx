import { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { emrApi } from './emrApi';
import { showErrorDialog } from '../ui/uiSlice';
import { useT } from '../../lib/i18n';

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.gif,.pdf';
const MAX_BYTES = 20 * 1024 * 1024;
// `accept` on the input is a hint to the OS file picker, not a constraint: it is
// stripped by anything that is not a real user gesture, and a caller can hand
// this component any File. The allowlist is duplicated from the server's, but the
// server stays the authority — this only avoids shipping 20 MB up the wire to be
// told off.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

export default function MedicalFileUpload({ onUploaded }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_BYTES) {
      dispatch(showErrorDialog({ message: t('emr.upload.tooLarge') || 'File exceeds 20 MB limit' }));
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      dispatch(showErrorDialog({
        message: t('emr.upload.invalidType') || 'Only JPEG, PNG, WebP, GIF and PDF files can be uploaded.',
      }));
      if (inputRef.current) inputRef.current.value = '';
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
            : 'text-slate-600 hover:border-brand/30 hover:text-brand dark:text-slate-300 dark:hover:border-brand'
        }`}
      >
        {uploading ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity={0.25} />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            {progress > 0 ? `${progress}%` : (t('emr.upload.uploading') || 'Uploading...')}
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
        {t('emr.upload.hint') || 'JPEG, PNG, WebP, GIF, PDF · Max 20 MB · Encrypted at rest on the server (AES-256-GCM)'}
      </span>
    </div>
  );
}
