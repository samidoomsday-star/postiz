#!/usr/bin/env python3
"""Check documented Linux prerequisites before creating local state."""
import platform
import shutil
import subprocess
import sys

if platform.system() != 'Linux' or platform.machine() != 'x86_64':
    sys.exit('This release candidate supports Linux x86_64 only; see LOCAL-TESTING.md.')
if sys.version_info < (3, 10):
    sys.exit('Python 3.10+ is required.')
required = ['bash', 'git', 'curl', 'tar', 'xz', 'sha256sum', 'make', 'g++', 'docker']
missing = [command for command in required if not shutil.which(command)]
if missing:
    sys.exit('Missing prerequisites: ' + ', '.join(missing))
for arguments in [['docker', 'info', '--format', '{{.ServerVersion}}'],
                  ['docker', 'compose', 'version', '--short']]:
    result = subprocess.run(arguments, capture_output=True, text=True)
    if result.returncode:
        sys.exit('Docker engine/Compose v2 unavailable. Check Docker installation and socket permissions.')
    print(' '.join(arguments[:2]) + ': ' + result.stdout.strip())
print('Linux x86_64 prerequisites found. Use a trusted local Docker daemon and free documented ports.')
