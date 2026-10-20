export function sortJobs(jobs, direction = 'newest') {
  return [...jobs].sort((a, b) => {
    const aDate = a.publishedAt ? Date.parse(a.publishedAt) : null;
    const bDate = b.publishedAt ? Date.parse(b.publishedAt) : null;
    if (aDate === null && bDate !== null) return 1;
    if (bDate === null && aDate !== null) return -1;
    if (aDate !== null && bDate !== null && aDate !== bDate) return direction === 'oldest' ? aDate - bDate : bDate - aDate;
    return (Date.parse(b.firstSeenAt || '') || 0) - (Date.parse(a.firstSeenAt || '') || 0) || a.company.localeCompare(b.company) || a.id.localeCompare(b.id);
  });
}
export function isNewListing(job, now = Date.now()) {
  const age = now - Date.parse(job.firstSeenAt || '');
  return !job.isSeed && Number.isFinite(age) && age >= 0 && age < 7 * 86400000;
}
