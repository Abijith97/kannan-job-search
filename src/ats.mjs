import { htmlText, inferLocations, publishedDate, normalizedTitle } from './listings.mjs';

// Public job-detail responses, never candidate/application endpoints.
export function atsJob(data, format, now = new Date()) {
  let title, description, labels, posted, expires, id, closed = false;
  if (format === 'workday') {
    const job = data.jobPostingInfo;
    if (!job?.title || !job.jobDescription) throw new Error('Workday vacancy details unavailable.');
    ({ title, jobDescription: description, startDate: posted, endDate: expires, jobReqId: id } = job);
    labels = [job.location, ...(job.additionalLocations || [])].map(value => typeof value === 'string' ? value : value?.location || value?.descriptor || '').filter(Boolean);
    closed = job.canApply === false;
  } else if (format === 'oracle') {
    const job = data.items?.[0];
    if (!job?.Title || !job.ExternalDescriptionStr) throw new Error('Oracle vacancy details unavailable.');
    title = job.Title; id = String(job.Id); posted = job.ExternalPostedStartDate; expires = job.ExternalPostedEndDate;
    description = [job.ExternalDescriptionStr, job.ExternalResponsibilitiesStr, job.ExternalQualificationsStr].filter(Boolean).join('\n');
    labels = [job.PrimaryLocation, ...(job.secondaryLocations || []).map(item => item.LocationName || item.Name || ''), ...(job.workLocation || []), ...(job.otherWorkLocations || [])].map(item => typeof item === 'string' ? item : [item.TownOrCity, item.Region2, item.Country].filter(Boolean).join(', ')).filter(Boolean);
  } else throw new Error('Unknown vacancy format.');
  description = htmlText(description);
  if (description.length < 120) throw new Error('Full vacancy description unavailable.');
  closed ||= Number.isFinite(Date.parse(expires)) && Date.parse(expires) < now.getTime();
  const locations = [...new Map(labels.flatMap(label => inferLocations(label)).map(item => [item.state, item])).values()];
  return { title, description: description.slice(0, 16000), locations, publishedAt: publishedDate(posted, now), availability: closed ? 'closed' : 'open', atsId: id };
}
export function atsDetails(raw, job, now = new Date()) {
  const detail = atsJob(JSON.parse(raw), job.detailFormat, now);
  if (normalizedTitle(detail.title) !== normalizedTitle(job.title) || (job.atsId && String(detail.atsId) !== String(job.atsId))) throw new Error('The source describes a different vacancy.');
  return detail;
}
