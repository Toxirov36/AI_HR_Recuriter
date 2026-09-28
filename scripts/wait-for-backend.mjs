const healthUrl = 'http://127.0.0.1:3000/api/health';
const deadline = Date.now() + 45_000;
let ready = false;

while (Date.now() < deadline) {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_000) });
    if (response.ok) {
      console.log('Backend ready; starting frontend.');
      ready = true;
      break;
    }
  } catch {
    // The backend is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}

if (!ready) {
  console.error(`Backend did not become ready at ${healthUrl} within 45 seconds.`);
  process.exitCode = 1;
}
