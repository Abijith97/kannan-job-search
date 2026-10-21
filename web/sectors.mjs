export const sectors = {
  education: 'Education & student services', consulting: 'Consulting',
  technology: 'Technology & software', financial: 'Financial services',
  consumer: 'Retail & consumer services', healthcare: 'Healthcare',
  media: 'Media & marketing', industrial: 'Logistics & manufacturing',
  hospitality: 'Hospitality & travel', other: 'Other industries', unknown: 'Sector to confirm'
};
const researchedEducationSources = new Set(['idp', 'envision', 'santamonica', 'zolve', 'leap', 'viavifa', 'cokonet']);
// These are the four original, manually reviewed education matches. New
// assessments supply their own sector; do not infer a sector from a title.
const researchedEducationEmployers = new Set(['I, Saras', 'Offenso TechSchool', 'Athena Education', 'Impressio Product and Services']);
export function sectorOf(job) {
  if (Object.hasOwn(sectors, job.sector)) return job.sector;
  if (researchedEducationSources.has(job.sourceId) || researchedEducationEmployers.has(job.company)) return 'education';
  return 'unknown';
}
export const isOtherIndustry = job => !['education', 'consulting', 'unknown'].includes(sectorOf(job));
export function matchesSector(job, filter) {
  return filter === 'all' || (filter === 'other' ? isOtherIndustry(job) : filter === 'education-consulting' && ['education', 'consulting'].includes(sectorOf(job)));
}
