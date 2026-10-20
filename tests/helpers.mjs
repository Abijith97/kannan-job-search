import { profile } from '../.generated/data.mjs';

export function sampleSelection() {
  return { summary_ids: [profile.summary[0].id], skill_ids: profile.skills.slice(0, 6).map(x => x.id), experiences: profile.experiences.map(x => ({ role_id: x.id, bullet_ids: x.bullets.slice(0, 2).map(b => b.id) })), rationale: 'This version emphasizes education sales, partner acquisition and student conversion using the supplied resume.', gaps: ['Confirm destination and CRM requirements with the employer.'] };
}

export function openAIResponse(selection = sampleSelection()) {
  return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(selection) }] }] }), { headers: { 'Content-Type': 'application/json' } });
}

export function memoryState() {
  const records = new Map(); let queue = Promise.resolve();
  const storage = {
    async get(key) { return structuredClone(records.get(key)); },
    async put(key, value) { records.set(key, structuredClone(value)); },
    async delete(key) { for (const k of Array.isArray(key) ? key : [key]) records.delete(k); },
    async list({ prefix }) { return new Map([...records].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, structuredClone(value)])); },
    async setAlarm() {},
    async transaction(callback) { const previous = queue; let release; queue = new Promise(resolve => release = resolve); await previous; try { return await callback(storage); } finally { release(); } }
  };
  return { storage };
}
