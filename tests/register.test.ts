import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { registerContainer, detectByFiles } from '../src/index';
import type { ContainerRuntime } from '../src/index';

function fakeApi(root: string) {
  const calls: any = { rowMenus: {}, actions: {}, fragments: [], setups: [], css: [], typeActions: [] };
  const api: any = {
    name: 'acme', config: {}, settings: { file: 'plugin.acme.settings.yml', read: () => ({}), set() {}, setList() {} },
    lib: {
      esc: (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)),
      ROOT: root, workspaceDir: (ws: string) => path.join(root, ws), listProjects: (dir: string) => fs.readdirSync(dir),
      screenAction: (send: any, o: any) => { calls.screen = o; send('started'); }, NAME_RE: /^[a-zA-Z0-9_-]+$/,
      run: async () => ({ ok: true, code: 0, stdout: 'running', stderr: '' }),
    },
    addRowMenu: (slot: string, spec: any, fn: any) => { calls.rowMenus[slot] = { spec, fn }; },
    addAction: (name: string, fn: any) => { calls.actions[name] = fn; },
    addFragment: (fn: any) => calls.fragments.push(fn), addFolderSetup: (s: any) => calls.setups.push(s),
    addCss: (f: string) => calls.css.push(f), addTypeAction: (a: string, t: string[]) => calls.typeActions.push([a, t]),
  };
  return { api, calls };
}

const runtime: ContainerRuntime = {
  id: 'acme', label: 'ACME', title: 'Acme Runtime', cli: 'acme', cliHint: 'install acme',
  detect: (dir) => { const p = detectByFiles(dir, ['acme.yml']); return p ? { ...p, name: 'site1-app', url: 'http://site1.acme.local' } : null; },
  state: async (_p, _dir, lib) => { const out = await lib.run('acme', ['status'], _dir); return /running/.test(String(out.stdout)) ? 'up' : 'down'; },
  verbs: {
    start: { label: 'Start', icon: 'play', cmd: () => 'acme start', kind: 'start' },
    stop: { label: 'Stop', icon: 'ban', cmd: () => 'acme stop', kind: 'stop' },
    status: { label: 'Status', icon: 'info', cmd: () => 'acme info', kind: 'status' },
    logs: { label: 'Logs', icon: 'file-text', cmd: () => 'acme logs -f', kind: 'logs' },
    shell: { label: 'Shell', icon: 'terminal', cmd: () => 'acme ssh', kind: 'shell' },
    destroy: { label: 'Destroy', icon: 'trash', cmd: (_p, project) => `acme destroy ${project} -y`, kind: 'other', danger: true },
  },
  init: { label: 'Create acme.yml here', cmd: () => 'acme init --yes', help: 'Scaffolds the file.' },
  menuNote: 'Every verb opens a terminal in the project',
};

function tree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'container-'));
  fs.mkdirSync(path.join(root, 'dev', 'site1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dev', 'plain'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dev', 'site1', 'acme.yml'), 'name: site1-app\n');
  return root;
}

test('register() gives the runtime its slot, type action, stylesheet, verbs, caption fragment and init option', () => {
  const { api, calls } = fakeApi(tree());
  registerContainer(api, runtime);
  assert.deepStrictEqual(calls.rowMenus.acme.spec, { label: 'ACME', row: 0 });
  assert.deepStrictEqual(calls.typeActions, [['acme', ['sites', 'code']]]);
  assert.ok(calls.css[0].endsWith('/css/container.css') && fs.existsSync(calls.css[0]));
  assert.deepStrictEqual(Object.keys(calls.actions).sort(), ['verb-destroy', 'verb-logs', 'verb-shell', 'verb-start', 'verb-status', 'verb-stop']);
  assert.strictEqual(calls.fragments.length, 1);
  assert.strictEqual(calls.setups.length, 1);
});

test('the menu shows on a folder the runtime recognises, grouped, with the site link and the danger verb marked', () => {
  const root = tree();
  const { api, calls } = fakeApi(root);
  registerContainer(api, runtime);
  const ctx = (project: string, allowed = new Set(['acme'])) => ({ key: 'dev', project, dir: path.join(root, 'dev'), meta: {}, allowed, vals: () => "hx-vals='{}'" });
  const html = calls.rowMenus.acme.fn(ctx('site1'));
  assert.match(html, /site1-app · acme\.yml/);
  assert.match(html, /http:\/\/site1\.acme\.local/);
  assert.match(html, /\/actions\/p\/acme\/verb-start/);
  assert.match(html, /class="uk-text-danger"[^>]*>.*Destroy/);
  assert.match(html, /hx-get="\/fragments\/p\/acme\/state\/dev\/site1"/);
  assert.match(html, /Every verb opens a terminal/);
  assert.strictEqual(calls.rowMenus.acme.fn(ctx('plain')), null, 'no file, no menu');
  assert.strictEqual(calls.rowMenus.acme.fn(ctx('site1', new Set(['ddev']))), null, 'a type that does not allow it gets nothing');
  assert.match(calls.rowMenus.acme.fn(ctx('site1', new Set())), /ACME/, 'an empty allowed set means every type');
});

test('the caption fragment answers the runtime\'s state; a verb runs in a screen in the project with the CLI check in front', async () => {
  const root = tree();
  const { api, calls } = fakeApi(root);
  registerContainer(api, runtime);
  let out = '';
  await calls.fragments[0]({ send: (h: string) => { out = h; }, rest: 'state/dev/site1' });
  assert.strictEqual(out, 'up');
  await calls.fragments[0]({ send: (h: string) => { out = h; }, rest: 'state/dev/plain' });
  assert.strictEqual(out, '');
  await calls.actions['verb-destroy']({ form: { projectName: 'site1' }, send: (h: string) => { out = h; }, workspace: 'dev' });
  assert.strictEqual(out, 'started');
  assert.strictEqual(calls.screen.verb, 'acme-destroy');
  assert.match(calls.screen.cmdLine, /^command -v acme >\/dev\/null 2>&1 \|\| \{ echo "acme is not installed: install acme"; exit 1; \}; acme destroy site1 -y$/);
  assert.strictEqual(calls.screen.projectDir, path.join(root, 'dev', 'site1'));
  await calls.actions['verb-start']({ form: { projectName: 'plain' }, send: (h: string) => { out = h; }, workspace: 'dev' });
  assert.match(out, /not a Acme Runtime project/);
});

test('the New-folder option runs the init command in the new folder', () => {
  const { api, calls } = fakeApi(tree());
  registerContainer(api, runtime);
  const [s] = calls.setups;
  assert.match(s.html('dev', {}), /name="acme" value="init"/);
  assert.deepStrictEqual(s.steps('dev', 'n', { acme: 'init' }), ["( cd 'n' && acme init --yes )"]);
  assert.deepStrictEqual(s.steps('dev', 'n', {}), []);
});
