import { buildApp } from './app.js';
import { readConfig } from './config.js';

try {
  const config = readConfig();
  const app = await buildApp();
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  console.error(`xCLOUD startup failed: ${error.message}`);
  process.exitCode = 1;
}
