"""Run outside the VM. Emails contain only operational status, never credentials."""
import email.message
import json
import os
import pathlib
import smtplib
import ssl
import subprocess
import sys
import time
import urllib.request

def should_notify(previous, issues, now):
    return (previous.get('issues', []) != issues or
            (bool(issues) and now - previous.get('sentAt', 0) >= 21600))

def send_email(subject, body):
    config = json.loads(os.environ['MONITOR_SMTP_CONFIG'])
    message = email.message.EmailMessage()
    message['From'] = config['SMTP_FROM']
    message['To'] = os.environ['MONITOR_EMAIL']
    message['Subject'] = subject
    message.set_content(body)
    port = int(config.get('SMTP_PORT') or 587)
    secure = str(config.get('SMTP_SECURE', str(port == 465))).lower() == 'true'
    context = ssl.create_default_context()
    if secure:
        smtp = smtplib.SMTP_SSL(config['SMTP_HOST'], port, timeout=20, context=context)
    else:
        smtp = smtplib.SMTP(config['SMTP_HOST'], port, timeout=20)
    with smtp:
        if not secure:
            smtp.starttls(context=context)
        smtp.login(config['SMTP_USER'], config['SMTP_PASSWORD'])
        smtp.send_message(message)

def main():
    if '--test-email' in sys.argv:
        send_email('HR Recruiter: monitoring sinov xabari',
                   'Monitoring sozlandi. Sayt, disk va R2 backup holati tekshiriladi. Bu sinov xabari.')
        print('Test message accepted by SMTP server')
        return 0
    issues = []
    for path in ['/', '/api/health']:
        for attempt in range(2):
            try:
                with urllib.request.urlopen('https://hr-recruiter.ddns.net' + path, timeout=20) as response:
                    if response.status != 200:
                        raise ValueError('Unexpected HTTP status')
                    if path == '/api/health' and json.load(response).get('status') != 'ok':
                        raise ValueError('Unhealthy API')
                break
            except Exception:
                if attempt == 0:
                    time.sleep(5)
                else:
                    issues.append('HTTPS check failed: ' + path)
    try:
        report = subprocess.check_output(['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
            '-o', 'ConnectTimeout=15', os.environ['DEPLOY_USER'] + '@' + os.environ['DEPLOY_HOST'],
            'python3 ~/hr-recruiter/ops/health-report.py'], timeout=45, stderr=subprocess.DEVNULL)
        issues.extend(json.loads(report)['issues'])
    except Exception:
        issues.append('Server SSH health check unavailable')
    issues = sorted(set(issues))
    directory = pathlib.Path('.monitor-state')
    directory.mkdir(exist_ok=True)
    statefile = directory / 'state.json'
    try:
        previous = json.loads(statefile.read_text())
    except (OSError, ValueError):
        previous = {}
    now = time.time()
    if should_notify(previous, issues, now):
        subject = 'HR Recruiter: muammo aniqlandi' if issues else 'HR Recruiter: xizmat tiklandi'
        body = '\n'.join(issues) if issues else 'Sayt, server va backup tekshiruvlari yana muvaffaqiyatli.'
        send_email(subject, body + '\n\nhttps://hr-recruiter.ddns.net')
        statefile.write_text(json.dumps({'issues': issues, 'sentAt': now}))
    print(json.dumps({'issues': issues, 'healthy': not issues}))
    return 1 if issues else 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print('Monitoring/notification failed (' + type(error).__name__ + ')', file=sys.stderr)
        sys.exit(1)
