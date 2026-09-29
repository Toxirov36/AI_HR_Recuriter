import datetime, json, pathlib, shutil, subprocess

base = pathlib.Path('/home/dilshodbektohirov40/hr-recruiter')
issues = []
total, used, free = shutil.disk_usage('/')
disk_percent = round(used * 100 / total, 1)
if disk_percent >= 85:
    issues.append(f'Disk usage is {disk_percent}% (threshold 85%)')
try:
    backup = json.loads((base / 'ops-state/backup.json').read_text())
    last = datetime.datetime.fromisoformat(backup['lastSuccess'].replace('Z', '+00:00'))
    age = (datetime.datetime.now(datetime.timezone.utc) - last).total_seconds() / 3600
    if age > 30 or not backup.get('restoreVerified'):
        issues.append('Verified R2 backup is missing or older than 30 hours')
except (OSError, ValueError, KeyError):
    issues.append('Verified R2 backup status unavailable')
try:
    data = json.loads(subprocess.check_output(['docker', 'inspect',
        'ai-hr-recruiter-backend-1', 'ai-hr-recruiter-frontend-1',
        'ai-hr-recruiter-postgres-1', 'ai-hr-recruiter-redis-1'], timeout=15))
    for item in data:
        state = item['State']
        if not state.get('Running') or state.get('Health', {}).get('Status', 'healthy') != 'healthy':
            issues.append(item['Name'] + ' is not healthy')
except (subprocess.SubprocessError, ValueError):
    issues.append('Docker service status unavailable')
if subprocess.run(['systemctl', 'is-failed', '--quiet', 'hr-backup.service']).returncode == 0:
    issues.append('Daily backup service failed')
print(json.dumps({'issues': issues, 'diskPercent': disk_percent}))
