# @webship.co/workspace-container

The container family's shared base for [Webship Workspace](https://github.com/webship/workspace)
plugins. A runtime plugin (`@webship.co/workspace-docker`, `-lando`, `-docksal`, `-podman`,
`-kubernetes`) is one call plus its runtime:

```ts
import { registerContainer } from '@webship.co/workspace-container';
export function register(api: PluginApi) { registerContainer(api, runtime); }
```

`registerContainer` draws the row menu on every project the runtime recognises (its verbs as
terminal sessions in the project: start, stop, restart, status, logs, shell and the runtime's own,
plus the site link), answers the up/down caption after the row is drawn, and adds the "scaffold a
project file here" option to New folder. The `ContainerRuntime` says what differs: how a folder is
detected as a project, the CLI, how to tell whether it is up, the verbs and their commands.
