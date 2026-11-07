/**
 * registerContainer(api, runtime): the whole surface of a container-runtime plugin.
 *
 * The row menu on every project the runtime recognises (its verbs as screen sessions in the
 * project, grouped: start/stop/restart, status, logs and shell, the rest; the site link), the
 * up/down caption, and the New-folder init option. What differs between runtimes is in the runtime.
 */

import fs from 'fs';
import path from 'path';
import type { ActionContext, Form, PluginApi, RowContext } from '@webship/workspace-plugin-api';

import type { ContainerProject, ContainerRuntime } from './runtime';

export * from './runtime';

/** The first of `files` that exists in the folder, as a project, or null. */
export function detectByFiles(projectDir: string, files: string[]): ContainerProject | null {
  for (const f of files) {
    if (fs.existsSync(path.join(projectDir, f))) return { file: f };
  }
  return null;
}

export function registerContainer(api: PluginApi, r: ContainerRuntime): void {
  const { esc, workspaceDir, listProjects, screenAction, NAME_RE } = api.lib;
  const post = (name: string) => `/actions/p/${api.name}/${name}`;
  const shq = (v: unknown) => `'${String(v).replace(/'/g, `'\\''`)}'`;

  if (typeof api.addCss === 'function') api.addCss(path.join(__dirname, '..', '..', 'css', 'container.css'));
  if (typeof api.addTypeAction === 'function') api.addTypeAction(r.id, ['sites', 'code']);

  // The detection, memoised briefly: a page of thirty rows stats the same files once.
  let cache = new Map<string, ContainerProject | null>();
  let cacheAt = 0;
  const projectOf = (dir: string): ContainerProject | null => {
    const now = Date.now();
    if (now - cacheAt > 5000) { cache = new Map(); cacheAt = now; }
    if (!cache.has(dir)) { try { cache.set(dir, r.detect(dir)); } catch (_) { cache.set(dir, null); } }
    return cache.get(dir) || null;
  };

  // The state, cached for a short while per folder: the menu must not run the CLI per render.
  const states = new Map<string, { at: number; value: 'up' | 'down' | 'unknown' }>();
  async function stateOf(p: ContainerProject, dir: string): Promise<'up' | 'down' | 'unknown'> {
    const hit = states.get(dir);
    if (hit && Date.now() - hit.at < 15 * 1000) return hit.value;
    let value: 'up' | 'down' | 'unknown' = 'unknown';
    try { value = await r.state(p, dir, api.lib); } catch (_) { value = 'unknown'; }
    states.set(dir, { at: Date.now(), value });
    return value;
  }

  const item = (name: string, v: { label: string; icon: string; danger?: boolean }, vals: () => string) =>
    `<li><a href hx-post="${post(`verb-${name}`)}" ${vals()}${v.danger ? ' class="uk-text-danger"' : ''}><span uk-icon="icon: ${esc(v.icon)}; ratio: .7"></span> ${esc(v.label)}</a></li>`;

  api.addRowMenu(r.id, { label: r.label, row: 0 }, ({ project, dir, allowed, vals }: RowContext) => {
    if (allowed.size && !allowed.has(r.id)) return null;
    const pdir = path.join(dir, project);
    const p = projectOf(pdir);
    if (!p) return null;
    const groups: Record<string, string[]> = { lifecycle: [], status: [], look: [], other: [] };
    for (const [name, v] of Object.entries(r.verbs)) {
      const html = item(name, v, vals);
      if (v.kind === 'start' || v.kind === 'stop' || v.kind === 'restart') groups.lifecycle.push(html);
      else if (v.kind === 'status') groups.status.push(html);
      else if (v.kind === 'logs' || v.kind === 'shell') groups.look.push(html);
      else groups.other.push(html);
    }
    return `<span class="act-with-status"><div class="uk-inline act-menu act-menu-${esc(r.id)} act-menu-container">
        <button class="uk-button uk-button-default uk-button-small" type="button" title="${esc(r.title)}: ${esc(p.file)}"><span uk-icon="icon: server; ratio: .7"></span> ${esc(r.label)} <span uk-icon="icon: chevron-down; ratio: .6"></span></button>
        <div uk-dropdown="mode: click; pos: bottom-right"><ul class="uk-nav uk-dropdown-nav">
          <li class="uk-nav-header" data-group="project">${esc(p.name || project)} · ${esc(p.file)}</li>
          ${p.url ? `<li><a href="${esc(p.url)}" target="_blank" rel="noopener"><span uk-icon="icon: link-external; ratio: .7"></span> Open the site</a></li>` : ''}
          ${groups.lifecycle.join('')}
          ${groups.status.length ? `<li class="uk-nav-divider"></li>${groups.status.join('')}` : ''}
          ${groups.look.length ? `<li class="uk-nav-divider"></li>${groups.look.join('')}` : ''}
          ${groups.other.length ? `<li class="uk-nav-divider"></li>${groups.other.join('')}` : ''}
          ${r.menuNote ? `<li class="uk-nav-header container-menu-note">${esc(r.menuNote)}</li>` : ''}
        </ul></div>
      </div><span class="act-status uk-text-meta" hx-get="/fragments/p/${esc(api.name)}/state/${encodeURIComponent(dir.split('/').pop() || '')}/${encodeURIComponent(project)}" hx-trigger="load delay:200ms" hx-swap="innerHTML">…</span></span>`;
  });

  // The caption, answered after the row is drawn: 'up', 'down' or '?'.
  api.addFragment(async ({ send, rest }) => {
    const m = rest.match(/^state\/([a-z0-9_-]+)\/([a-zA-Z0-9_-]+)$/);
    if (!m) return send('', 404);
    const dir = path.join(workspaceDir(m[1]), m[2]);
    const p = projectOf(dir);
    if (!p) return send('');
    const s = await stateOf(p, dir);
    send(s === 'unknown' ? '?' : s);
  });

  const guard = ({ form, send, workspace }: ActionContext) => {
    const dir = workspaceDir(workspace);
    const project = String(form.projectName || '');
    if (!NAME_RE.test(project) || !listProjects(dir).includes(project)) { send('<div class="msg error">Unknown project.</div>', 400); return null; }
    const p = projectOf(path.join(dir, project));
    if (!p) { send(`<div class="msg error">This folder is not a ${esc(r.title)} project.</div>`, 409); return null; }
    return { dir, project, p };
  };

  for (const [name, v] of Object.entries(r.verbs)) {
    api.addAction(`verb-${name}`, (ctx: ActionContext) => {
      const g = guard(ctx); if (!g) return;
      states.delete(path.join(g.dir, g.project));
      return screenAction(ctx.send, { workspace: ctx.workspace, project: g.project, projectDir: path.join(g.dir, g.project),
        ownerDir: path.join(g.dir, g.project), verb: `${r.id}-${name}`,
        cmdLine: `command -v ${r.cli} >/dev/null 2>&1 || { echo "${r.cli} is not installed: ${r.cliHint.replace(/"/g, '\\"')}"; exit 1; }; ${v.cmd(g.p, g.project)}`,
        label: `${r.id} ${v.label.toLowerCase()}` });
    });
  }

  if (r.init) {
    const init = r.init;
    api.addFolderSetup({
      html: () => `<div class="uk-margin-small-top folder-container folder-${esc(r.id)}">
          <span class="uk-text-meta">${esc(r.title)}:</span>
          <label class="uk-margin-small-right"><input class="uk-radio" type="radio" name="${esc(r.id)}" value="none" checked> Not now</label>
          <label><input class="uk-radio" type="radio" name="${esc(r.id)}" value="init"> ${esc(init.label)}</label>
          ${init.help ? `<div class="uk-text-meta">${esc(init.help)}</div>` : ''}
        </div>`,
      steps: (_ws: string, name: string, form: Form) => (form[r.id] === 'init' ? [`( cd ${shq(name)} && ${init.cmd(name)} )`] : []),
      prompt: () => [],
      problem: () => '',
    } as any);
  }
}
