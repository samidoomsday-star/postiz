#!/usr/bin/env python3
"""Start/stop only this checkout's recorded application processes (Linux)."""
import argparse
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import time
import urllib.request

root = Path(__file__).resolve().parents[2]
local = root / '.agency'
registry = local / 'runtime.json'
node = str(local / 'tools/node/bin/node')
apps = {
    'backend': ([node, '--experimental-require-module', str(root / 'apps/backend/dist/apps/backend/src/main.js')], root, 3000, 'http://127.0.0.1:3000/auth/can-register'),
    'orchestrator': ([node, '--experimental-require-module', str(root / 'apps/orchestrator/dist/apps/orchestrator/src/main.js')], root, 3002, 'http://127.0.0.1:3002/health/status'),
    'frontend': ([node, str(root / 'node_modules/next/dist/bin/next'), 'start', '-p', '4200', '--hostname', '127.0.0.1'], root / 'apps/frontend', 4200, 'http://127.0.0.1:4200/auth/login'),
}

def start_tick(pid):
    return Path(f'/proc/{pid}/stat').read_text().rpartition(')')[2].split()[19]

def owned(item):
    try:
        pid = item['pid']
        if Path(f'/proc/{pid}/stat').read_text().rpartition(')')[2].split()[0] in {'Z', 'X'}:
            return False
        # PID reuse must not cause another task's process to be signaled.
        # Next.js changes process.title, so argv is not a durable identity.
        uid_line = next(line for line in Path(f'/proc/{pid}/status').read_text().splitlines() if line.startswith('Uid:'))
        return (start_tick(pid) == item['start_tick'] and
                int(uid_line.split()[1]) == os.getuid() and os.getpgid(pid) == pid)
    except (FileNotFoundError, ProcessLookupError, StopIteration):
        return False

def save(state):
    registry.write_text(json.dumps(state, indent=2) + '\n')
    os.chmod(registry, 0o600)

def ready(url):
    try:
        with urllib.request.urlopen(url, timeout=3) as response:
            return response.status == 200
    except Exception:
        return False

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'stop', 'status'])
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument('--api-only', action='store_true')
    selection.add_argument('--worker-only', action='store_true')
    args = parser.parse_args()
    if not Path('/proc').exists():
        parser.error('This supervisor has been verified on Linux only')
    if args.action == 'start' and (os.environ.get('AGENCY_TEST_MODE') != 'true' or os.environ.get('AGENCY_TEST_ACK') != 'LOCAL_SYNTHETIC_ONLY'):
        parser.error('Run through scripts/agency/with-env.sh in explicit synthetic mode')
    state = json.loads(registry.read_text()) if registry.exists() else {}
    selected = ['orchestrator'] if args.worker_only else ['backend', 'orchestrator'] if args.api_only else list(apps)
    if args.action == 'start':
        for name in selected:
            command, cwd, port, url = apps[name]
            if name in state and owned(state[name]):
                print(f'{name}: existing owned process retained')
                continue
            with socket.socket() as check:
                # Recently stopped HTTP sockets may remain in TIME_WAIT. Match
                # the server's reuse behavior while still rejecting listeners.
                check.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                try:
                    check.bind(('127.0.0.1', port))
                except OSError:
                    raise RuntimeError(f'Port {port} is in use by an unrecorded process; will not kill it')
            if name == 'frontend' and not (cwd / '.next/BUILD_ID').exists():
                raise RuntimeError('Frontend production build is missing')
            log = local / 'logs' / f'{name}.log'
            with log.open('ab') as output:
                os.chmod(log, 0o600)
                process = subprocess.Popen(command, cwd=cwd, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            state[name] = {'pid': process.pid, 'command': command, 'cwd': str(cwd), 'start_tick': start_tick(process.pid)}
            save(state)
            print(f'{name}: started; log .agency/logs/{name}.log')
        deadline = time.monotonic() + 50
        while time.monotonic() < deadline:
            failed = [name for name in selected if not owned(state[name])]
            if failed:
                raise RuntimeError(f'Application process exited: {failed}; inspect its log')
            if all(ready(apps[name][3]) for name in selected):
                print('HTTP readiness passed; run integration tests to verify actual worker behavior.')
                return
            time.sleep(1)
        raise RuntimeError('Application readiness timed out; inspect .agency/logs/')
    elif args.action == 'stop':
        for name in reversed(selected):
            item = state.get(name)
            if item and owned(item):
                os.killpg(item['pid'], signal.SIGTERM)
                deadline = time.monotonic() + 15
                while owned(item) and time.monotonic() < deadline:
                    time.sleep(0.2)
                if owned(item):
                    raise RuntimeError(f'{name} did not stop gracefully; inspect before escalating')
                print(f'{name}: stopped')
            state.pop(name, None)
        save(state)
    else:
        for name in selected:
            print(f"{name}: {'running' if name in state and owned(state[name]) else 'stopped'}; HTTP ready={ready(apps[name][3])}")

if __name__ == '__main__':
    main()
