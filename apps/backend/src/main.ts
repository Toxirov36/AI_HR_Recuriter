import { createApp } from './app.module';
import { getConfig } from './config/app.config';

void createApp()
  .then((app) => app.listen(getConfig().PORT, '0.0.0.0'))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Backend startup failed');
    process.exitCode = 1;
  });
