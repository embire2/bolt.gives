# bolt.gives Desktop v1.11.0

Desktop v1.11.0 is a mandatory native Windows update released from the public `desktop/windows` source tree.

## Database setup

- Adds a native three-step Supabase wizard for registration, project credentials, server verification, replacement, and disconnection.
- Opens **Register Supabase for Free** and the Supabase dashboard in the user's default browser, then lets the user return to the native wizard.
- Accepts only a Supabase project URL with a publishable or anon key. Secret and service-role keys are rejected before transport.
- Keeps credentials out of native project history and generated source. The server stores them against the owning runtime session.
- Removes PostgreSQL provisioning and credential display from the Live CLI. Dedicated Ubuntu workspaces remain database-free.

## Source and updates

- Publishes the complete C#/.NET 8 WPF source, portable tests, installer definition, and signed-release workflow in the main repository.
- Preserves the separate `desktop-v*` release line and makes v1.11.0 mandatory for older supported clients.
- Retains SHA-256, exact GitHub asset, size, Authenticode, UAC, old-process shutdown, post-install version, and rollback validation.
- Pins the configured legacy Microsoft AOC03/EOC01 hierarchy plus the current ID Verified AOC/EOC 03/04 issuer rotations while still requiring each issuer's matching PCA/root, the expected bolt.gives publisher identity, code-signing usage, and timestamp.

## Verification

- Portable policy, stream, workspace, persistence, Preview, and updater tests run on Linux and Windows.
- Windows release CI builds and signs the native application and installer, launches a real top-level window, tests replacement and forced rollback, and publishes only after those checks pass.
