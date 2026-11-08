import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root')!;
root.style.cssText = [
  'padding:4px 12px',
  'overflow:hidden',
  'font-family:var(--oc-font, system-ui, sans-serif)',
  'font-size:12px',
  'line-height:20px',
  'color:var(--oc-muted)',
].join(';');

let currentSessionId: string | null = null;
let requestSeq = 0;

const resize = () => { void host.setHeight(Math.ceil(root.getBoundingClientRect().height)); };
new ResizeObserver(resize).observe(root);

const renderLine = (text: string) => {
  root.textContent = text;
  resize();
};

const renderSkills = (skills: Array<{ name: string; path?: string }>) => {
  root.textContent = '';
  if (skills.length === 0) {
    root.textContent = 'No skills loaded in this session';
    resize();
    return;
  }
  // Chips wrap sideways, so even a long list stays a few rows tall and the
  // frame never grows past the height the host clamps it to. A chip with a
  // known SKILL.md path copies that path; the app has no open-file call for
  // guests, so the clipboard is the hand-off into the file editor.
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'display:flex',
    'flex-wrap:wrap',
    'gap:4px',
    'padding:2px 0',
  ].join(';');
  for (const skill of skills) {
    const chip = document.createElement('span');
    chip.textContent = skill.name;
    chip.title = skill.path ?? skill.name;
    chip.style.cssText = [
      'color:var(--oc-fg)',
      'background:var(--oc-subtle)',
      'border:1px solid var(--oc-border)',
      'border-radius:999px',
      'padding:0 8px',
      'line-height:18px',
      'white-space:nowrap',
    ].join(';');
    if (skill.path) {
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', () => {
        void host.writeClipboard(skill.path!).then(() => host.toast({ kind: 'info', message: `Copied ${skill.name}/SKILL.md path` }));
      });
    }
    wrap.appendChild(chip);
  }
  root.appendChild(wrap);
  resize();
};

const refresh = async () => {
  if (!currentSessionId) {
    renderLine('Open a session to see the skills it loaded.');
    return;
  }
  const seq = ++requestSeq;
  try {
    const res = await host.serviceRequest({ method: 'GET', path: `/skills?session=${encodeURIComponent(currentSessionId)}` });
    if (seq !== requestSeq) return;
    if (res.status !== 200) {
      renderLine('Could not load skills.');
      return;
    }
    const data = JSON.parse(res.body) as { skills?: unknown };
    const entries = Array.isArray(data.skills) ? data.skills : [];
    renderSkills(entries
      .filter((s): s is { name: string; path?: string } => Boolean(s) && typeof (s as { name?: unknown }).name === 'string')
      .map((s) => ({ name: s.name, path: typeof s.path === 'string' ? s.path : undefined })));
  } catch {
    if (seq !== requestSeq) return;
    renderLine('Could not load skills.');
  }
};

// The service announces turns; refresh while this section shows that session.
host.onServiceEvent((event) => {
  const data = event.data as { sessionId?: string } | undefined;
  if (data && typeof data.sessionId === 'string' && data.sessionId === currentSessionId) {
    void refresh();
  }
});

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  const sessionId = context.session?.id ?? null;
  if (sessionId === currentSessionId) return;
  currentSessionId = sessionId;
  void refresh();
});
