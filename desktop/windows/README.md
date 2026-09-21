# bolt.gives Desktop

Proprietary native Windows client for the hosted bolt.gives agentic coding service.

## Release line

- Desktop stable: `v1.11.0`
- Web release versions are independent.
- Public binary release tags use `desktop-v{version}` in `embire2/bolt.gives`.

## Native product boundary

The product shell is C#/.NET 8 and WPF/XAML. WebView2 is restricted to generated project Preview; it never loads the hosted bolt.gives interface. These client workflows use native Windows controls:

- profile creation, emailed six-digit sign-in code, DPAPI-protected session, and sign-out
- project-scoped history, Chat, Workspace, model selection, Build/Discuss modes, and queued follow-ups
- source file browsing/search, syntax-aware editing, save/diff, remote terminal, and runtime status
- live Preview health, per-user WebView2 storage and explicit initialization, automatic-repair state, responsive viewport presets, and external Preview launch
- FREE subdomain, managed Cloudflare, and Custom Domain/Stripe deployment entry points
- isolated, database-free Ubuntu Live CLI workspaces
- native Supabase registration and verified connection wizard
- token balance, allowance-reset state, quota pause/upgrade path, settings, and bug reporting
- optional and mandatory application updates

The Desktop client sends the server-issued project-memory key with each follow-up, retains the hosted runtime identity, and stores project history under a one-way profile-specific directory key. Switching Windows or bolt.gives profiles cannot expose another profile's projects. Build responses are parsed and executed natively in model order while they stream: project-relative file actions are synced atomically, generated shell commands pass a mutation guard, and Preview starts only after the server stream settles. An already healthy server-verified Preview is reused instead of launching a conflicting duplicate process; otherwise the native start command must return both a zero exit code and a verified ready event. Runtime caches and build output stay out of the source file tree. The hosted service selects the compact FREE build prompt; Desktop never invents a prompt-library identifier.

## Authentication and secrets

Sign-in uses a six-digit, ten-minute, one-time code entered inside the app. Profile sessions are encrypted with Windows DPAPI for the current Windows user and written atomically. No operator-funded provider key, SMTP credential, runtime-node administrator credential, or signing secret enters the source tree or compiled client.

## Packaging

The GitHub Actions workflow builds on `windows-latest`, runs the portable regression suite, publishes a self-contained `win-x64` app, and packages it with Inno Setup. The installer:

- requests Windows administrator approval and installs per-machine by default
- closes the old Desktop process before replacing files
- creates Start Menu and optional Desktop shortcuts
- installs Microsoft's signed Evergreen WebView2 bootstrapper only when Preview's runtime is absent
- launches the app as the original Windows user after an interactive installation

On first launch, Desktop explains how to pin its running icon to the taskbar. Windows requires the user to approve taskbar pins, so the app does not attempt a hidden pin.

The workflow signs the native executable, assemblies, privileged updater, and installer through Azure Artifact Signing. CI requires an RFC3161 timestamp and verifies the pinned Private Trust certificate hierarchy before publishing any artifact.

The active Azure profile is `PrivateTrust`. Its root is not part of the default Windows trusted-root program, so an unmanaged machine may still show an unknown-publisher or SmartScreen warning. An approved `PublicTrust` profile is required to remove that consumer-distribution limitation; CI does not misrepresent Private Trust as public trust.

## Fail-safe updates

Desktop v1.11.0 uses a small, separately signed privileged updater. The unprivileged app downloads only the exact versioned GitHub release asset, enforces a 350 MB size ceiling, verifies manifest size and SHA-256, verifies Authenticode against the pinned signing hierarchy, and then asks Windows for administrator approval.

After approval, the updater verifies a hash-bound handoff and the requesting Desktop process, waits for the old app to close, creates a disk-capacity-checked rollback copy, runs the installer, and verifies the installed version and signature. A failed replacement restores and verifies the previous installation. A cancelled UAC prompt changes nothing. Mandatory releases block coding and can only be installed or exited; optional releases can be dismissed. The installer also recognizes the legacy 1.0.x `/RESTARTAPPLICATIONS` handoff and relaunches v1.11.0 after that older updater finishes.

## Development verification

```powershell
dotnet restore BoltGives.Desktop.sln
dotnet format BoltGives.Desktop.sln --verify-no-changes --no-restore
dotnet test BoltGives.Desktop.sln --configuration Release --no-restore
dotnet build BoltGives.Desktop.sln --configuration Release --no-restore
```

The portable suite covers native stream framing, ordered workspace actions, server-stream/start coordination, source-file visibility, path traversal rejection, generated shell-mutation blocking, profile-isolated history, Preview navigation, and updater security. The release workflow additionally exercises a real native window launch, signed installer replacement, installed-version verification, successful updater handoff, forced post-install failure, verified rollback, and legacy-updater relaunch on Windows.

## Source

The native client source lives in `desktop/windows` in the public bolt.gives repository and is covered by the repository license. Provider keys, profile tokens, signing credentials, SMTP settings, and infrastructure credentials are not part of the source or binaries.
