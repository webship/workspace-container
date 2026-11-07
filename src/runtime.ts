/**
 * What a container runtime is, to the dashboard.
 *
 * A runtime (Docker Compose, Lando, Docksal, Podman, Kubernetes) runs a project from a file the
 * project carries (docker-compose.yml, .lando.yml, .docksal/, a Containerfile, k8s manifests). The
 * row menu, the caption, the screen sessions and the New-folder section are the family's
 * (registerContainer); the runtime says how a project is detected, which commands do what, how to
 * tell whether it is up, and where the site answers.
 */

import type { PluginLib } from '@webship/workspace-plugin-api';

/** The project as the runtime sees it. */
export interface ContainerProject {
  /** The file (or folder) that made it a project of this runtime: 'docker-compose.yml'. */
  file: string;
  /** The project's name for the runtime, when it has one (the compose project, the lando app). */
  name?: string;
  /** Where the site answers, when the file says (a lando proxy, a compose port). */
  url?: string;
}

export interface RuntimeVerb {
  /** What the menu calls it. */
  label: string;
  /** An icon name for the menu. */
  icon: string;
  /** The command line, run in the project folder in a screen session. */
  cmd: (p: ContainerProject, project: string) => string;
  /** 'start' | 'stop' | 'restart' | 'status' | 'logs' | 'shell' | 'other': where the menu puts it. */
  kind: 'start' | 'stop' | 'restart' | 'status' | 'logs' | 'shell' | 'other';
  /** Only offered when the project is up (logs, shell) or down (start). */
  when?: 'up' | 'down';
  /** Outward-facing or destructive: the menu says so. */
  danger?: boolean;
}

export interface ContainerRuntime {
  /** The slot, the type action and the route namespace: 'lando'. */
  id: string;
  /** The button's text: 'LANDO'. */
  label: string;
  /** The product's name in sentences: 'Lando'. */
  title: string;
  /** The CLI: 'lando', 'fin', 'docker', 'podman', 'kubectl'. */
  cli: string;
  /** How to install it, for the message when it is missing. */
  cliHint: string;
  /** Whether a folder is a project of this runtime, and what. Memoised by the caller per render. */
  detect: (projectDir: string) => ContainerProject | null;
  /** Whether the project is up: a quick command answering 'up', 'down' or 'unknown'. Cached by the caller. */
  state: (p: ContainerProject, projectDir: string, lib: PluginLib) => Promise<'up' | 'down' | 'unknown'>;
  /** The verbs, in menu order. */
  verbs: Record<string, RuntimeVerb>;
  /** The New-folder option: scaffold a project file (the command run in the new folder), or none. */
  init?: { label: string; cmd: (name: string) => string; help?: string };
  /** A line the menu ends with. */
  menuNote?: string;
}
