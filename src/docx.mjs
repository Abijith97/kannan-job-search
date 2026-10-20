import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

export async function makeDocx(resume) {
  const text = (value, options = {}) => new TextRun({ text: String(value), ...options });
  const paragraph = (value, options = {}) => new Paragraph({ children: [text(value)], spacing: { after: 80 }, ...options });
  const heading = value => paragraph(value, { heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 180, after: 90 } });
  const children = [
    paragraph(resume.name, { heading: HeadingLevel.TITLE, spacing: { after: 100 } }),
    paragraph(resume.headline, { spacing: { after: 100 } }),
    ...resume.contact.map(value => paragraph(value, { spacing: { after: 35 } })),
    heading('Profile'), paragraph(resume.summary.join(' ')),
    heading('Core Skills'), paragraph(resume.skills.join(' | ')), heading('Experience')
  ];
  for (const role of resume.experiences) {
    children.push(new Paragraph({ children: [text(role.title, { bold: true })], keepNext: true, spacing: { before: 120, after: 35 } }));
    children.push(paragraph(`${role.employer} | ${role.dates}`, { keepNext: true, spacing: { after: 70 } }));
    for (const fact of role.bullets) children.push(paragraph(fact, { bullet: { level: 0 }, spacing: { after: 65 } }));
  }
  children.push(heading('Education'));
  for (const study of resume.education) {
    children.push(new Paragraph({ children: [text(study.degree, { bold: true })], keepNext: true, spacing: { before: 80, after: 35 } }));
    children.push(paragraph(study.detail));
  }
  children.push(heading('Certifications'));
  for (const certificate of resume.certifications) children.push(paragraph(certificate, { bullet: { level: 0 }, spacing: { after: 40 } }));
  const document = new Document({
    creator: resume.name, title: `${resume.name} Resume`, description: 'Editable resume',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22, color: '202020' }, paragraph: { spacing: { line: 270 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: 'Calibri', size: 38, bold: true, color: '000000' } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { font: 'Calibri', size: 23, bold: true, color: '000000' }, paragraph: { keepNext: true } }
      ]
    },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 850, bottom: 850, left: 850, right: 850 } } }, children }]
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}
