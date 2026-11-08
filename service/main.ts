import http from 'node:http';
import { createServiceHost } from '@openchamber/sdk';
import { SESSION_EVENTS_PATH, readSessionEventRequest } from '@openchamber/sdk';

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? '';
const opencodeUrl = (process.env.OPENCHAMBER_OPENCODE_URL ?? '').replace(/\/$/, '');

if (!port || !token) {
  console.error('OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required');
  process.exit(1);
}

const host = createServiceHost({ env: process.env });

const json = (res: http.ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

async function fetchMessages(sessionId: string): Promise<any[]> {
  if (!opencodeUrl) return [];
  try {
    const res = await fetch(`${opencodeUrl}/api/session/${encodeURIComponent(sessionId)}/message`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  } catch {
    return [];
  }
}

function extractSkills(messages: any[]): Array<{ name: string; path?: string }> {
  const byName = new Map<string, { name: string; path?: string }>();
  for (const m of messages) {
    const parts = Array.isArray(m?.parts) ? m.parts : (Array.isArray(m?.content) ? m.content : []);
    for (const p of parts) {
      if (!p) continue;
      const isSkillTool = p.type === 'tool' && (p.tool === 'skill' || p.name === 'skill');
      if (!isSkillTool) continue;
      const input = p?.state?.input ?? p?.input ?? {};
      const name =
        (typeof input.id === 'string' ? input.id : null) ??
        (typeof input.name === 'string' ? input.name : null) ??
        (typeof p?.state?.metadata?.name === 'string' ? p.state.metadata.name : null) ??
        (typeof p?.metadata?.name === 'string' ? p.metadata.name : null) ??
        (typeof p?.state?.title === 'string' ? p.state.title.replace(/^Loaded skill:\s*/i, '') : null);
      if (typeof name !== 'string' || !name.trim()) continue;
      const key = name.trim();
      const entry = byName.get(key) ?? { name: key };
      if (!entry.path) {
        const dir =
          (typeof p?.state?.metadata?.dir === 'string' && p.state.metadata.dir) ??
          (typeof p?.metadata?.dir === 'string' && p.metadata.dir) ??
          null;
        if (dir) entry.path = `${dir}/SKILL.md`;
        else {
          const output = typeof p?.state?.output === 'string' ? p.state.output : '';
          const match = output.match(/Base directory for this skill:\s*(.+)/);
          if (match) entry.path = `${match[1].trim()}/SKILL.md`;
        }
      }
      byName.set(key, entry);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    json(res, 401, { error: 'unauthorized' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/health') {
    json(res, 200, {});
    return;
  }
  if (url.pathname === '/skills' && req.method === 'GET') {
    const sessionId = url.searchParams.get('session');
    if (!sessionId) {
      json(res, 400, { error: 'missing session' });
      return;
    }
    void fetchMessages(sessionId).then((messages) => {
      json(res, 200, { skills: extractSkills(messages) });
    }, () => {
      json(res, 200, { skills: [] });
    });
    return;
  }
  if (url.pathname === SESSION_EVENTS_PATH && req.method === 'POST') {
    void readBody(req).then((body) => {
      const request = readSessionEventRequest(body);
      if (!request) {
        json(res, 400, { ok: false, error: 'not a session event' });
        return;
      }
      json(res, 200, { ok: true });
      const { event } = request;
      if (event.type === 'turn-started' || event.type === 'turn-finished' || event.type === 'session-created') {
        // A mounted status page re-reads the session it is showing when it hears this.
        host.emit('turn', { sessionId: event.session.id }).catch(() => {});
      }
    }).catch(() => json(res, 500, { ok: false, error: 'could not read request' }));
    return;
  }
  json(res, 404, { error: 'not-found' });
});

server.listen(port, '127.0.0.1');
