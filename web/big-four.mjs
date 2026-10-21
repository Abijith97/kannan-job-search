export const bigFour = [
  { id: 'ey', name: 'EY', url: 'https://careers.ey.com/ey/search/?optionsFacetsDD_country=IN' },
  { id: 'deloitte', name: 'Deloitte', url: 'https://usijobs.deloitte.com/en_US/careersUSI/SearchJobs' },
  { id: 'pwc', name: 'PwC', url: 'https://www.pwc.in/careers.html' },
  { id: 'kpmg', name: 'KPMG', url: 'https://kpmg.com/in/en/careers.html' }
];
export function bigFourOf(job) {
  if (bigFour.some(company => company.id === job.sourceId)) return job.sourceId;
  return /^EY\b|^Ernst\s*(?:&|and)\s*Young\b/i.test(job.company || '') ? 'ey' : /^Deloitte\b/i.test(job.company || '') ? 'deloitte' : /^(?:PwC\b|PricewaterhouseCoopers\b)/i.test(job.company || '') ? 'pwc' : /^KPMG\b/i.test(job.company || '') ? 'kpmg' : null;
}
export function matchesCompany(job, filter) {
  return filter === 'all' || (filter === 'big-four' ? Boolean(bigFourOf(job)) : bigFourOf(job) === filter);
}
