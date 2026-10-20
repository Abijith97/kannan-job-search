// First deployment only: register a free workers.dev address if the account has none.
// Existing account subdomains are always preserved. Credentials stay in memory.
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error('Cloudflare deployment settings are missing.');
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/subdomain`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const currentResponse = await fetch(endpoint, { headers });
const current = await currentResponse.json();
if (current.success && current.result?.subdomain) {
  console.log(`Using existing workers.dev address: ${current.result.subdomain}.workers.dev`);
} else {
  if ([401, 403].includes(currentResponse.status)) throw new Error('Cloudflare token cannot manage the workers.dev address. Open Workers & Pages in the Cloudflare dashboard once, then rerun deployment.');
  const owner = (process.env.GITHUB_REPOSITORY?.split('/')[0] || 'kannan').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 35);
  let registered = false;
  for (const subdomain of [`${owner}-jobs`, `${owner}-jobs-2026`]) {
    const response = await fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify({ subdomain }) });
    const result = await response.json();
    if (result.success) { console.log(`Registered free address: ${result.result.subdomain}.workers.dev`); registered = true; break; }
    const taken = result.errors?.some(error => /already|taken|available|exists/i.test(error.message));
    if (!taken) throw new Error(`Cloudflare could not register a workers.dev address (codes: ${(result.errors || []).map(error => error.code).join(', ')}). Open Workers & Pages in the Cloudflare dashboard once, then rerun deployment.`);
  }
  if (!registered) throw new Error('Suggested workers.dev names are taken. Choose a name in Cloudflare Workers & Pages, then rerun deployment.');
}
