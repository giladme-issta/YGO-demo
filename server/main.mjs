import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
import { createYgoClient } from './ygo-client.mjs';
import { createHotelRepository } from './repository.mjs';
import { createDemoQaClient } from './demo-qa.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv.includes('--live') ? 'live'
  : process.argv.includes('--sample') ? 'sample'
    : process.env.YGO_DATA_MODE || 'snapshot';
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exitCode = 1;
} else {
  const repository = createHotelRepository({
    mode,
    cacheDir: path.join(root, '.cache', 'hotels'),
    samplePath: path.join(root, 'response-api-example.json'),
    client: createYgoClient(),
  });
  const qaClient = createDemoQaClient();
  const server = createApp({
    repository, publicDir: path.join(root, 'public'), qaClient,
    mapboxPublicToken: process.env.MAPBOX_PUBLIC_TOKEN,
  });
  server.on('error', error => {
    console.error(`[server] ${error.code || 'START_FAILED'}: unable to listen on ${host}:${port}.`);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log(`YGO hotel POC: http://${host}:${port} (${mode} data; demo prices; ${qaClient.available ? 'YGO AI enabled' : 'factual Q&A only'})`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close();
      server.closeAllConnections();
    });
  }
}
