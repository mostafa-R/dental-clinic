import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import ClinicalNoteFormModal from './ClinicalNoteFormModal';
import { deleteNote, fetchNotes } from './emrSlice';
import { showErrorDialog } from '../ui/uiSlice';
import { useSocketEvent } from '../../lib/socket';
import { canManageEmr } from '../../lib/roles';
import { useT } from '../../lib/i18n';
import { formatDate } from '../../lib/format';
import { PhiField } from '../../hooks/usePhi';

function Section({ label, value, phi }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{phi ? <PhiField>{value}</PhiField> : value}</p>
    </div>
  );
}

export default function ClinicalTimelineTab({ patientId, patient }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const { items: notes, status, error } = useSelector((s) => s.emr.notes);
  const canManage = canManageEmr();

  const [formOpen, setFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);

  const refetch = useCallback(() => {
    dispatch(fetchNotes({ patientId, params: { limit: 100 } }));
  }, [dispatch, patientId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useSocketEvent('clinical-note:created', refetch);
  useSocketEvent('clinical-note:updated', refetch);
  useSocketEvent('clinical-note:deleted', refetch);

  const onDelete = async (noteId) => {
    if (!window.confirm(t('emr.note.deleteConfirm'))) return;
    try {
      await dispatch(deleteNote({ patientId, noteId })).unwrap();
    } catch (err) {
      dispatch(showErrorDialog(err));
    }
  };

  const onEdit = (note) => {
    setEditingNote(note);
    setFormOpen(true);
  };

  const openCreate = () => {
    setEditingNote(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingNote(null);
  };

  const isLoading = status === 'loading' || status === 'idle';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('emr.note.subtitle')}</p>
        {canManage && (
          <button type="button" onClick={openCreate} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            {t('emr.note.new')}
          </button>
        )}
      </div>

      {isLoading && <Spinner label={t('emr.note.loading')} />}
      {error && !isLoading && <EmptyState title={t('emr.note.loadFailed')} message={error?.message} />}
      {!isLoading && !error && notes.length === 0 && <EmptyState title={t('emr.note.empty')} />}

      {!isLoading && !error && notes.length > 0 && (
        <div className="relative space-y-4 ps-4">
          <span className="absolute start-0 top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
          {notes.map((note) => (
            <div key={note._id} className="relative">
              <span className="absolute start-[-5px] top-3 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-indigo-100 dark:ring-indigo-500/20" aria-hidden="true" />
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{note.noteNo}</span>
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                        {t('emr.note.byDoctor', { doctor: note.doctor?.name || '—' })}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{formatDate(note.visitDate)}</p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => onEdit(note)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                        {t('common.edit')}
                      </button>
                      <button type="button" onClick={() => onDelete(note._id)} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15">
                        {t('common.delete')}
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Section label={t('emr.note.chiefComplaint')} value={note.chiefComplaint} phi />
                  <Section label={t('emr.note.examination')} value={note.examination} phi />
                  <Section label={t('emr.note.diagnosis')} value={note.diagnosis} phi />
                  <Section label={t('emr.note.plan')} value={note.plan} phi />
                </div>

                {note.attachments?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {note.attachments.map((att, i) => (
                      <a
                        key={i}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group block overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
                      >
                        {att.type === 'xray' || att.type === 'photo' ? (
                          <div className="relative h-24 w-24">
                            <img src={att.url} alt={att.caption || ''} className="h-full w-full object-cover transition group-hover:opacity-80" loading="lazy" />
                            <span className="absolute right-1 top-1 rounded-full bg-emerald-500/80 p-0.5" title="Encrypted">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                            </span>
                          </div>
                        ) : (
                          <div className="relative flex h-24 w-24 flex-col items-center justify-center gap-1 bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                            <span className="text-[10px]">{t(`emr.attachment.${att.type}`)}</span>
                            <span className="absolute right-1 top-1 rounded-full bg-emerald-500/80 p-0.5" title="Encrypted">
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                            </span>
                          </div>
                        )}
                        {att.caption && <span className="block truncate px-1 py-0.5 text-[10px] text-slate-500 dark:text-slate-400">{att.caption}</span>}
                      </a>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          ))}
        </div>
      )}

      <ClinicalNoteFormModal open={formOpen} patientId={patientId} patient={patient} note={editingNote} onClose={closeForm} />
    </div>
  );
}
