import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, PageHeader, StatusPill } from '../../components/ui';
import { fetchRequirementDocuments, uploadRequirementDocument, uploadRequirementDocumentFile } from '../../lib/api';
import { useProject } from '../../lib/project-context';
import { describeSupabaseError } from '../../lib/errors';
import { formatFileSize, statusTone, timeAgo } from '../../lib/requirements-style';
import type { RequirementDocument } from '../../lib/types';

const TABS = [
  { value: 'upload', label: 'Upload', icon: 'upload_file' },
  { value: 'documents', label: 'Extracted Documents', icon: 'description' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export default function RequirementsDashboard() {
  const { project } = useProject();
  const [activeTab, setActiveTab] = useState<Tab>('upload');
  const [documents, setDocuments] = useState<RequirementDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [rawText, setRawText] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [fileTitle, setFileTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileWebhookUrl, setFileWebhookUrl] = useState('');
  const [fileSubmitting, setFileSubmitting] = useState(false);
  const [fileSubmitError, setFileSubmitError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    if (!project) return;
    try {
      const data = await fetchRequirementDocuments(project.id);
      setLoadError(null);
      setDocuments(data);
    } catch (err) {
      setLoadError(describeSupabaseError(err, 'Failed to load requirement documents'));
    }
  }, [project]);

  useEffect(() => {
    setLoading(true);
    loadDocuments().finally(() => setLoading(false));
  }, [loadDocuments]);

  const handleFile = useCallback((file: File) => {
    setSelectedFile(file);
    setFileTitle((current) => current || file.name.replace(/\.[^.]+$/, ''));
  }, []);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileUpload = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!project) return;
      if (!fileTitle.trim() || !selectedFile) {
        setFileSubmitError('Both a title and a file are required.');
        return;
      }
      setFileSubmitting(true);
      setFileSubmitError(null);
      try {
        await uploadRequirementDocumentFile(project.id, fileTitle.trim(), selectedFile, fileWebhookUrl.trim() || undefined);
        setFileTitle('');
        setSelectedFile(null);
        setFileWebhookUrl('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadDocuments();
        setActiveTab('documents');
      } catch (err) {
        setFileSubmitError(describeSupabaseError(err, 'Failed to upload document'));
      } finally {
        setFileSubmitting(false);
      }
    },
    [project, fileTitle, selectedFile, fileWebhookUrl, loadDocuments]
  );

  const handleUpload = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!project) return;
      if (!title.trim() || !rawText.trim()) {
        setSubmitError('Both a title and document text are required.');
        return;
      }
      setSubmitting(true);
      setSubmitError(null);
      try {
        // Extraction is triggered server-side as part of this same call.
        await uploadRequirementDocument(project.id, { title: title.trim(), rawText, webhookUrl: webhookUrl.trim() || undefined });

        setTitle('');
        setRawText('');
        setWebhookUrl('');
        await loadDocuments();
        setActiveTab('documents');
      } catch (err) {
        setSubmitError(describeSupabaseError(err, 'Failed to upload document'));
      } finally {
        setSubmitting(false);
      }
    },
    [project, title, rawText, webhookUrl, loadDocuments]
  );

  return (
    <>
      <PageHeader
        title="Requirements & Validation"
        subtitle="Upload a BRD/PRD/SRS and have an LLM extract structured requirements plus suggested test cases."
      />

      <div className="flex items-center gap-2 mb-6 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.value ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon name={tab.icon} className="text-[16px]" />
            {tab.label}
            {tab.value === 'documents' && documents.length > 0 && (
              <span className="ml-0.5 text-[11px] font-semibold text-text-muted">({documents.length})</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'upload' && (
      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
              <Icon name="upload_file" className="text-[20px]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">Upload a file</h2>
              <p className="text-xs text-text-secondary">PDF, DOCX, TXT, or MD — text is extracted automatically.</p>
            </div>
          </div>
          <form onSubmit={handleFileUpload} className="space-y-4 mt-5">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
                Title
              </label>
              <input
                type="text"
                value={fileTitle}
                onChange={(e) => setFileTitle(e.target.value)}
                placeholder="e.g. Checkout Flow PRD v2"
                className="w-full text-sm border border-border rounded-md px-3 py-2 bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
                Document file
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleFileDrop}
                className={`rounded-lg border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${
                  dragActive
                    ? 'border-primary bg-primary-light'
                    : selectedFile
                      ? 'border-success bg-success-light'
                      : 'border-border hover:border-primary hover:bg-primary-light/40'
                }`}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2.5">
                    <Icon name="description" className="text-[22px] text-success" />
                    <div className="text-left min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate max-w-[220px]">{selectedFile.name}</p>
                      <p className="text-[11px] text-text-secondary">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="ml-1 text-text-muted hover:text-danger p-1"
                      title="Remove file"
                    >
                      <Icon name="close" className="text-[16px]" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Icon name="cloud_upload" className="text-[28px] text-text-muted mb-1" />
                    <p className="text-sm text-text-primary">
                      <span className="font-semibold text-primary">Click to browse</span> or drag and drop
                    </p>
                    <p className="text-[11px] text-text-secondary mt-0.5">PDF, DOCX, TXT, or MD</p>
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
                Webhook URL (optional)
              </label>
              <input
                type="url"
                value={fileWebhookUrl}
                onChange={(e) => setFileWebhookUrl(e.target.value)}
                placeholder="https://your-system.example.com/webhooks/requirements"
                className="w-full text-sm border border-border rounded-md px-3 py-2 bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              <p className="flex items-start gap-1 text-[11px] text-text-secondary mt-1.5">
                <Icon name="info" className="text-[13px] shrink-0 mt-px" />
                Notified with a POST request once extraction finishes, instead of you having to check back.
              </p>
            </div>

            {fileSubmitError && <p className="text-sm text-danger">{fileSubmitError}</p>}

            <Button type="submit" variant="primary" disabled={fileSubmitting} className="w-full justify-center">
              <Icon name="upload_file" className="text-[16px]" />
              {fileSubmitting ? 'Uploading...' : 'Upload & Extract Requirements'}
            </Button>
          </form>
        </Card>

        <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background border border-border items-center justify-center text-[11px] font-bold text-text-muted">
          OR
        </div>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-success-light text-success flex items-center justify-center shrink-0">
              <Icon name="edit_note" className="text-[20px]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">Paste text directly</h2>
              <p className="text-xs text-text-secondary">No file needed — paste the document's text below.</p>
            </div>
          </div>
          <form onSubmit={handleUpload} className="space-y-4 mt-5">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Checkout Flow PRD v2"
                className="w-full text-sm border border-border rounded-md px-3 py-2 bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
                Document text
              </label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={5}
                placeholder="Paste the full BRD/PRD/SRS text here..."
                className="w-full text-sm border border-border rounded-md px-3 py-2 bg-white text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
                Webhook URL (optional)
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-system.example.com/webhooks/requirements"
                className="w-full text-sm border border-border rounded-md px-3 py-2 bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              <p className="flex items-start gap-1 text-[11px] text-text-secondary mt-1.5">
                <Icon name="info" className="text-[13px] shrink-0 mt-px" />
                Notified with a POST request once extraction finishes, instead of you having to check back.
              </p>
            </div>

            {submitError && <p className="text-sm text-danger">{submitError}</p>}

            <Button type="submit" variant="primary" disabled={submitting} className="w-full justify-center">
              <Icon name="upload_file" className="text-[16px]" />
              {submitting ? 'Uploading...' : 'Upload & Extract Requirements'}
            </Button>
          </form>
        </Card>
      </div>
      )}

      {activeTab === 'documents' && (
      <>
      {loadError && <p className="text-sm text-danger mb-4">{loadError}</p>}

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">Uploaded Documents</h2>
          <p className="text-xs text-text-secondary">Extraction runs automatically after upload.</p>
        </div>

        {!loading && documents.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState
              icon="description"
              title="No requirements documents yet"
              description="Upload a BRD, PRD, or SRS above (PDF, DOCX, TXT, or MD) to extract structured requirements and suggested test cases."
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                to={`/projects/${project?.id}/requirements/${doc.id}`}
                className="px-5 py-3 flex items-center gap-4 flex-wrap hover:bg-background/60 transition-colors"
              >
                <span className="text-sm font-medium text-text-primary">{doc.title}</span>
                <StatusPill tone={statusTone(doc.status)}>{doc.status.toUpperCase()}</StatusPill>
                {doc.source_filename && (
                  <span className="text-xs text-text-muted font-mono">
                    {doc.source_filename}
                    {formatFileSize(doc.file_size_bytes) && ` · ${formatFileSize(doc.file_size_bytes)}`}
                  </span>
                )}
                {doc.status === 'failed' && doc.error_message && (
                  <span className="text-xs text-danger truncate max-w-xs">{doc.error_message}</span>
                )}
                <div className="flex items-center gap-3 ml-auto shrink-0">
                  <span className="text-xs text-text-muted whitespace-nowrap">{timeAgo(doc.created_at)}</span>
                  <Icon name="chevron_right" className="text-[18px] text-text-muted" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
      </>
      )}
    </>
  );
}
