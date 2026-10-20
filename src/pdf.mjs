import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const printable = text => String(text).replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7e\n]/g, ' ');

export async function makePdf(resume) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(`${resume.name} - Resume`);
  doc.setAuthor(resume.name);
  const width = 595.28, height = 841.89, margin = 46, lineHeight = 13.5;
  const ink = rgb(.13, .18, .21), muted = rgb(.35, .39, .42), teal = rgb(.1, .32, .32);
  let page, y;
  const newPage = () => { page = doc.addPage([width, height]); y = height - margin; };
  newPage();
  const need = amount => { if (y - amount < margin + 20) newPage(); };
  const wrap = (text, font, size, available) => {
    const lines = []; let line = '';
    for (const word of printable(text).split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= available) { line = candidate; continue; }
      if (line) lines.push(line);
      line = word;
      while (font.widthOfTextAtSize(line, size) > available) {
        let end = line.length - 1;
        while (font.widthOfTextAtSize(line.slice(0, end), size) > available) end--;
        lines.push(line.slice(0, end)); line = line.slice(end);
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const write = (text, { font = regular, size = 9.5, color = ink, indent = 0, gap = 4, bullet = false } = {}) => {
    const lines = wrap(text, font, size, width - 2 * margin - indent);
    need(lines.length * lineHeight + gap);
    lines.forEach((line, i) => { need(lineHeight); if (bullet && i === 0) page.drawText('-', { x: margin, y, size, font, color }); page.drawText(line, { x: margin + indent, y, size, font, color }); y -= lineHeight; });
    y -= gap;
  };
  const heading = text => { need(65); y -= 10; write(text, { font: bold, size: 9, color: teal, gap: 7 }); };
  write(resume.name.toUpperCase(), { font: bold, size: 23, gap: 13 });
  write(resume.headline, { size: 10, color: teal, gap: 7 });
  for (const contact of resume.contact) write(contact, { size: 8.5, color: muted, gap: 0 });
  heading('PROFILE');
  write(resume.summary.join(' '));
  heading('CORE SKILLS'); write(resume.skills.join('  |  '));
  heading('EXPERIENCE');
  for (const role of resume.experiences) {
    need(100);
    write(role.title, { font: bold, size: 10, gap: 1 });
    write(`${role.employer}  |  ${role.dates}`, { size: 8.5, color: muted, gap: 5 });
    for (const bullet of role.bullets) write(bullet, { indent: 12, bullet: true });
    y -= 5;
  }
  heading('EDUCATION');
  for (const study of resume.education) { need(40); write(study.degree, { font: bold, gap: 0 }); write(study.detail, { size: 9, color: muted, gap: 6 }); }
  heading('CERTIFICATIONS');
  for (const cert of resume.certifications) write(cert, { size: 9, gap: 1 });
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`${printable(resume.name)}  |  ${i + 1} / ${pages.length}`, { x: margin, y: 28, size: 8, font: regular, color: muted }));
  return doc.save();
}
