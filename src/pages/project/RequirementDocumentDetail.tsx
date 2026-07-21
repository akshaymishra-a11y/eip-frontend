import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, StatusPill } from '../../components/ui';
import { RequirementCard } from '../../components/requirements/RequirementCard';
import {
  downloadRequirementDocumentFile,
  fetchRequirementDocuments,
  fetchRequirements,
  processRequirementDocument,
} from '../../lib/api';
import { useProject } from '../../lib/project-context';
import { describeSupabaseError } from '../../lib/errors';
import { formatFileSize, statusTone } from '../../lib/requirements-style';
import { exportRequirementsToPdf, exportRequirementsToWord } from '../../lib/requirements-export';
import type { Requirement, RequirementDocument } from '../../lib/types';

// No single-document GET endpoint exists on the backend (only list-all and
// list-requirements-for-one) — re-fetching the full project list and finding
// this one by id avoids adding a new route for what's otherwise a one-off
// detail view.
export default function RequirementDocumentDetail() {
  const { project } = useProject();
  const { documentId } = useParams<{ documentId: string }>();
  const [document, setDocument] = useState<RequirementDocument | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);

  const load = useCallback(async () => {
    if (!project || !documentId) return;
    try {
      const docs = await fetchRequirementDocuments(project.id);
      const doc = docs.find((d) => d.id === documentId) ?? null;
      setDocument(doc);
      setLoadError(doc ? null : 'This document could not be found.');

      if (doc?.status === 'processed') {
        setRequirements(await fetchRequirements(documentId));
      } else {
        setRequirements([]);
      }
    } catch (err) {
      setLoadError(describeSupabaseError(err, 'Failed to load this document'));
    }
  }, [project, documentId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleDownload = useCallback(async () => {
    if (!document) return;
    try {
      const blob = await downloadRequirementDocumentFile(document.id);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.source_filename || document.title;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[RequirementDocumentDetail] download failed:', err);
    }
  }, [document]);

  const handleExportPdf = useCallback(() => {
    if (!document) return;
    exportRequirementsToPdf(document, requirements);
  }, [document, requirements]);

  const handleExportWord = useCallback(async () => {
    if (!document) return;
    setExportingWord(true);
    try {
      await exportRequirementsToWord(document, requirements);
    } catch (err) {
      console.error('[RequirementDocumentDetail] Word export failed:', err);
    } finally {
      setExportingWord(false);
    }
  }, [document, requirements]);

  const runExtraction = useCallback(async () => {
    if (!documentId) return;
    setProcessing(true);
    try {
      await processRequirementDocument(documentId);
    } catch (err) {
      console.error('[RequirementDocumentDetail] processRequirementDocument failed:', err);
    } finally {
      await load();
      setProcessing(false);
    }
  }, [documentId, load]);

  if (loading) return null;

  return (
    <>
      <nav className="flex items-center gap-2 text-text-muted text-xs mb-3">
        <Link to={`/projects/${project?.id}/requirements`} className="hover:text-text-primary">
          Requirements & Validation
        </Link>
        <Icon name="chevron_right" className="text-[14px]" />
        <span className="text-primary font-semibold">{document?.title ?? 'Document'}</span>
      </nav>

      {loadError && !document && (
        <Card className="p-6">
          <EmptyState icon="error" title="Document not found" description={loadError} />
        </Card>
      )}

      {document && (
        <>
          <Card className="p-5 mb-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                  <h1 className="text-xl font-bold text-text-primary tracking-tight">{document.title}</h1>
                  <StatusPill tone={statusTone(document.status)}>{document.status.toUpperCase()}</StatusPill>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-secondary flex-wrap">
                  {document.source_filename && (
                    <span className="font-mono">
                      {document.source_filename}
                      {formatFileSize(document.file_size_bytes) && ` · ${formatFileSize(document.file_size_bytes)}`}
                    </span>
                  )}
                  <span>Uploaded {new Date(document.created_at).toLocaleString()}</span>
                  {document.processed_at && <span>Processed {new Date(document.processed_at).toLocaleString()}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {document.storage_key && (
                  <Button type="button" variant="secondary" onClick={handleDownload}>
                    <Icon name="download" className="text-[16px]" />
                    Download
                  </Button>
                )}
                {(document.status === 'pending' || document.status === 'failed') && (
                  <Button type="button" variant="primary" disabled={processing} onClick={runExtraction}>
                    <Icon name="refresh" className="text-[16px]" />
                    {processing ? 'Processing...' : document.status === 'failed' ? 'Retry' : 'Process'}
                  </Button>
                )}
              </div>
            </div>

            {document.status === 'failed' && document.error_message && (
              <p className="text-sm text-danger bg-danger-light rounded-md px-3 py-2 mt-4">{document.error_message}</p>
            )}
            {(document.status === 'pending' || document.status === 'processing') && (
              <p className="text-sm text-text-secondary bg-background rounded-md px-3 py-2 mt-4">
                {document.status === 'processing'
                  ? 'Extraction is running — this page will show results once it finishes. Refresh to check.'
                  : 'This document has not been processed yet.'}
              </p>
            )}
          </Card>

          {document.status === 'processed' && (
            <div>
              <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
                <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
                  Extracted Requirements{requirements.length > 0 && ` (${requirements.length})`}
                </h2>
                {requirements.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="secondary" onClick={handleExportPdf}>
                      <Icon name="picture_as_pdf" className="text-[16px]" />
                      Export PDF
                    </Button>
                    <Button type="button" variant="secondary" disabled={exportingWord} onClick={handleExportWord}>
                      <Icon name="description" className="text-[16px]" />
                      {exportingWord ? 'Exporting...' : 'Export Word'}
                    </Button>
                  </div>
                )}
              </div>
              {requirements.length === 0 ? (
                <Card className="p-6">
                  <EmptyState icon="checklist" title="No requirements extracted" description="The LLM did not extract any requirements from this document." />
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {requirements.map((req) => (
                    <RequirementCard key={req.id} req={req} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
