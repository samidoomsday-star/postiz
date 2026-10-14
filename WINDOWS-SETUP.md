# Windows local setup — instructions for your IDE agent

Owner testing uses Windows. Run this candidate inside **Linux x86_64 WSL2**, with Docker Desktop's Linux engine and WSL integration. The app's process supervisor requires Linux `/proc`; native Windows Node, PowerShell and Git Bash cannot replace it. Linux setup is verified; the Windows/WSL2 host and browser forwarding are not tested by the cloud run.

Paste this into your IDE with the [candidate repository link](https://github.com/samidoomsday-star/postiz/tree/release/agency-v1-rc1):

> I use Windows. Read WINDOWS-SETUP.md, SETUP.md and AGENTS.md. Check my Windows/WSL2/Docker prerequisites, use an x86_64 Linux WSL2 environment, and clone branch release/agency-v1-rc1 inside its Linux filesystem. Preserve any existing checkout/data. Run bash start-local.sh, diagnose failures, complete the API/browser smoke checks, and leave the app running for me. Tell me the local browser address, demo credentials and stop/restart commands. Ask only for system actions you cannot perform, such as administrator approval, an interactive OS install or a reboot. Do not implement features, merge, reset data or request social credentials.

## 1. Inspect the PC

The IDE should run these read-only checks in PowerShell, handling a missing command as a prerequisite to fix:

```powershell
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, OSArchitecture
Get-Command wsl.exe, docker.exe -ErrorAction SilentlyContinue
wsl --status
wsl --list --verbose
```

Use a currently supported Windows x86_64 host for WSL2 and Docker Desktop (Windows 11 recommended; check current vendor requirements). Do not promise native ARM support. Ubuntu 24.04 LTS x86_64 is the recommended new distribution. Select an existing suitable Linux distribution explicitly; do not change the owner's default distribution or convert/remove an existing distro without understanding its data.

If WSL is absent, the concrete system step is an administrator-approved `wsl --install -d Ubuntu-24.04`, followed by a reboot if requested and initial Linux user setup in the WSL terminal. The IDE can prepare instructions and resume afterwards; it cannot fabricate administrator consent, fill a user's password or complete a required reboot itself. An already installed WSL2 distro should be reused.

Install/start Docker Desktop for Windows using its official installer. Select Linux containers and enable WSL integration for the chosen distribution. The Windows GUI, privilege prompts and initial account setup can require the owner's action. Do not install a competing Docker daemon inside an integrated distro or loosen socket permissions. If the user already has a different intentional Docker setup, diagnose it before changing it.

## 2. Move the IDE execution into WSL

Open the IDE's WSL/remote window or its WSL terminal in the selected distribution (for VS Code/Cursor, use the installed WSL integration; other IDEs can use their WSL interpreter/terminal). All following shell commands must run there, not in PowerShell or Git Bash.

If the repo was initially cloned to `C:\...`, preserve it and its changes. Prefer opening/cloning a separate clean checkout inside WSL's home filesystem for Linux dependencies, while keeping the Windows checkout intact. Never copy `.agency`, node_modules, generated builds or credentials between them. If local-only source changes must be tested, preserve/transfer them explicitly with the owner rather than silently ignoring or overwriting them. This platform move is justified by Linux filesystem/process requirements, not an invitation to create Git worktrees.

Inside WSL, verify:

```sh
uname -s
uname -m
python3 --version
docker info --format '{{.OSType}}'
docker compose version
```

Expect Linux, x86_64 and a Linux Docker engine. The preflight checks the remaining requirements. If Docker is unavailable inside WSL while Docker Desktop runs on Windows, inspect that distribution's WSL integration instead of resetting Docker or deleting containers/volumes.

## 3. Clone and run inside WSL

Use the chosen distribution's normal shell. Reuse an existing compatible checkout when present; the commands below are for a new directory:

```sh
mkdir -p ~/projects
cd ~/projects
git clone --branch release/agency-v1-rc1 --single-branch https://github.com/samidoomsday-star/postiz.git postiz-agency
cd postiz-agency
bash start-local.sh
```

If clone needs GitHub authentication, use the user's supported Git/Git Credential Manager login workflow inside WSL; never extract or paste tokens into project files. Private repository access is unrelated to social-provider credentials.

For Ubuntu 24.04's ordinary missing dependencies, use its package manager and appropriate system approval:

```sh
sudo apt-get update
sudo apt-get install -y git curl ca-certificates python3 make g++ xz-utils openssl libssl3t64
```

Package availability can differ by Ubuntu release: check the actual package error and official distribution options rather than disabling verification. The verified Linux browser path is Debian's system Chromium. The Ubuntu command intentionally omits Chromium: Ubuntu's packaging can require snap services. With system Chromium absent, setup invokes Playwright's `install --with-deps chromium` fallback. Follow its supported dependency installation and diagnose missing permissions/downloads; an interactive sudo prompt may require the owner in the Linux terminal, never a password in chat. That Ubuntu/browser branch remains unverified here. Never claim success until browser smoke tests actually finish on this PC.

Do not require Windows Node/pnpm: the project downloads pinned **Linux** tools into WSL's checkout. Provide 4 CPU cores, 16 GiB build RAM and 20 GiB free space to the WSL/Docker environment, not only the Windows host. WSL/Docker resource changes can affect other workloads; inspect current allocation before changing it.

## 4. Test from the Windows browser

After the command reports 12 passing smoke tests, frontend is on port **4200**, path `/auth/login`; demo owner is **owner-a@example.test** / **LocalFixture123!**. Mailpit inbox uses port **18025**. Windows normally forwards local WSL services to the host browser. The IDE must verify browser reachability on this PC instead of assuming cloud evidence proves forwarding.

If the Windows browser cannot reach the frontend, first check the app from inside WSL, then inspect WSL localhost forwarding, Docker Desktop health and firewall/VPN configuration. Do not switch listeners to public interfaces, disable the firewall or expose PostgreSQL/Temporal/mail to the Internet. Explain the precise Windows-side action needed. A WSL-internal browser test is functional application evidence; it does not alone prove host-browser reachability.

Leave the app and Docker Desktop/WSL available. Stop/restart from the same WSL checkout:

```sh
bash start-local.sh status
bash start-local.sh stop
bash start-local.sh
```

Sleep, shutdown, Docker Desktop restarts or `wsl --shutdown` stop processes; run the startup command again after returning. Do not use shutdown as an uninstall or data-reset tool. Keep the matching `.agency` settings, private media and Docker volumes. Follow [the tester walkthrough](docs/agency/LOCAL-TESTING.md) after startup. Real social connections remain disabled/unverified in this local candidate.
