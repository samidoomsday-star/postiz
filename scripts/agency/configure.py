#!/usr/bin/env python3
"""Create private synthetic development settings once; never overwrite user values."""
from pathlib import Path
import secrets
import os

root = Path(__file__).resolve().parents[2]
local = root / '.agency'
local.mkdir(mode=0o700, exist_ok=True)
for name in ['uploads', 'logs', 'results']:
    (local / name).mkdir(mode=0o700, exist_ok=True)
target = local / 'environment.env'
if target.exists():
    print('Existing .agency/environment.env preserved.')
else:
    password = secrets.token_hex(24)
    settings = {
        'AGENCY_DB_PASSWORD': password,
        'DATABASE_URL': f'postgresql://postiz_agency:{password}@127.0.0.1:15432/postiz_agency_test',
        'REDIS_URL': 'redis://127.0.0.1:16379',
        'TEMPORAL_ADDRESS': '127.0.0.1:17233',
        'TEMPORAL_NAMESPACE': 'default',
        'JWT_SECRET': secrets.token_hex(64),
        'FRONTEND_URL': 'http://localhost:4200',
        'MAIN_URL': 'http://localhost:4200',
        'IS_GENERAL': 'true',
        'NEXT_PUBLIC_BACKEND_URL': 'http://localhost:3000',
        'BACKEND_INTERNAL_URL': 'http://localhost:3000',
        'ORCHESTRATOR_PORT': '3002',
        'STORAGE_PROVIDER': 'local',
        'UPLOAD_DIRECTORY': str(local / 'uploads'),
        'NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY': 'uploads',
        'EMAIL_PROVIDER': 'nodemailer',
        'EMAIL_HOST': '127.0.0.1',
        'EMAIL_PORT': '11025',
        'EMAIL_SECURE': 'false',
        'EMAIL_USER': 'synthetic',
        'EMAIL_PASS': 'synthetic',
        'EMAIL_FROM_ADDRESS': 'noreply@example.test',
        'EMAIL_FROM_NAME': 'Agency local test',
        'AGENCY_TEST_MODE': 'true',
        'AGENCY_TEST_ACK': 'LOCAL_SYNTHETIC_ONLY',
        'AGENCY_PROVIDER_LOG': str(local / 'results/provider-calls.jsonl'),
        'API_LIMIT': '1000',
        'NEXT_TELEMETRY_DISABLED': '1',
        'NOT_SECURED': 'true',
    }
    # Values are generated here and shell single-quoted; never log their contents.
    with target.open('x') as f:
        os.chmod(target, 0o600)
        for key, value in settings.items():
            f.write(key + "='" + value.replace("'", "'\\''") + "'\n")
    print('Created private synthetic .agency/environment.env; no real provider credentials.')

# Add newly required nonsecret defaults without changing any existing binding.
existing_names = {line.split('=', 1)[0] for line in target.read_text().splitlines() if '=' in line}
with target.open('a') as f:
    for key, value in {'MAIN_URL': 'http://localhost:4200', 'IS_GENERAL': 'true'}.items():
        if key not in existing_names:
            f.write(key + "='" + value + "'\n")
