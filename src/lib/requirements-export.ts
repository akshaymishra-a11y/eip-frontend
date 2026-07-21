import { jsPDF } from 'jspdf';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { CATEGORY_LABEL, PRIORITY_LABEL } from './requirements-style';
import type { Requirement, RequirementDocument } from './types';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFilename(title: string): string {
  return title.trim().replace(/[^a-z0-9-_]+/gi, '_').slice(0, 80) || 'requirements';
}

// PDF export — hand-rolled pagination (jsPDF has no built-in flowed-text
// layout): track a running y cursor, word-wrap each line to the page width
// via splitTextToSize, and start a new page whenever a line would run past
// the bottom margin.
export function exportRequirementsToPdf(document: RequirementDocument, requirements: Requirement[]): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (linesNeeded: number, lineHeight: number) => {
    if (y + linesNeeded * lineHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeParagraph = (text: string, opts: { size: number; bold?: boolean; lineHeight?: number; gapAfter?: number } ) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size);
    const lineHeight = opts.lineHeight ?? opts.size * 1.35;
    const wrapped = doc.splitTextToSize(text, maxWidth) as string[];
    ensureSpace(wrapped.length, lineHeight);
    doc.text(wrapped, margin, y);
    y += wrapped.length * lineHeight + (opts.gapAfter ?? 0);
  };

  writeParagraph(document.title, { size: 18, bold: true, gapAfter: 4 });
  writeParagraph(
    `${requirements.length} requirement${requirements.length === 1 ? '' : 's'} · generated ${new Date().toLocaleString()}`,
    { size: 9, gapAfter: 16 },
  );

  requirements.forEach((req, i) => {
    if (i > 0) y += 10;
    ensureSpace(2, 16);
    doc.setDrawColor(210);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;

    const meta = [req.requirement_key, CATEGORY_LABEL[req.category], req.priority ? PRIORITY_LABEL[req.priority] : null]
      .filter(Boolean)
      .join('   ·   ');
    writeParagraph(meta, { size: 9, gapAfter: 4 });
    writeParagraph(req.title, { size: 12, bold: true, gapAfter: 4 });
    if (req.description) writeParagraph(req.description, { size: 10, gapAfter: 4 });
    if (req.source_excerpt) writeParagraph(`Source: "${req.source_excerpt}"`, { size: 9, gapAfter: 4 });
    if (req.ai_confidence != null) writeParagraph(`AI confidence: ${Math.round(req.ai_confidence * 100)}%`, { size: 9, gapAfter: 4 });

    if (req.suggested_test_cases && req.suggested_test_cases.length > 0) {
      writeParagraph('Suggested Test Cases:', { size: 9, bold: true, gapAfter: 2 });
      for (const tc of req.suggested_test_cases) {
        writeParagraph(`• ${tc.title}`, { size: 9, gapAfter: 2 });
        (tc.steps ?? []).forEach((step, si) => writeParagraph(`   ${si + 1}. ${step}`, { size: 9, gapAfter: 1 }));
      }
    }
  });

  doc.save(`${safeFilename(document.title)}.pdf`);
}

// Word export — builds a real .docx (Open XML) via the `docx` package,
// rather than the classic "HTML saved with a .doc extension" trick, so it
// opens cleanly in Word without a format-mismatch warning.
export async function exportRequirementsToWord(document: RequirementDocument, requirements: Requirement[]): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({ text: document.title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${requirements.length} requirement${requirements.length === 1 ? '' : 's'} · generated ${new Date().toLocaleString()}`,
          italics: true,
          size: 18,
        }),
      ],
    }),
  ];

  for (const req of requirements) {
    const meta = [req.requirement_key, CATEGORY_LABEL[req.category], req.priority ? PRIORITY_LABEL[req.priority] : null]
      .filter(Boolean)
      .join('   ·   ');

    children.push(
      new Paragraph({ text: '', spacing: { before: 200 } }),
      new Paragraph({ children: [new TextRun({ text: meta, size: 18, color: '666666' })] }),
      new Paragraph({ text: req.title, heading: HeadingLevel.HEADING_3 }),
    );
    if (req.description) children.push(new Paragraph({ text: req.description }));
    if (req.source_excerpt) {
      children.push(new Paragraph({ children: [new TextRun({ text: `Source: "${req.source_excerpt}"`, italics: true })] }));
    }
    if (req.ai_confidence != null) {
      children.push(new Paragraph({ children: [new TextRun({ text: `AI confidence: ${Math.round(req.ai_confidence * 100)}%`, size: 18 })] }));
    }
    if (req.suggested_test_cases && req.suggested_test_cases.length > 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Suggested Test Cases:', bold: true })] }));
      for (const tc of req.suggested_test_cases) {
        children.push(new Paragraph({ text: tc.title, bullet: { level: 0 } }));
        (tc.steps ?? []).forEach((step) => children.push(new Paragraph({ text: step, bullet: { level: 1 } })));
      }
    }
  }

  const docx = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(docx);
  downloadBlob(blob, `${safeFilename(document.title)}.docx`);
}
