/**
 * Load stack credentials from the monorepo api.trees.cloud .env, then overlay
 * this app's .env so PORT / API_TREES_CLOUD_URL win. Must be import #1.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, parse } from 'dotenv';

const here = resolve(__dirname, '..');
const apiEnvCandidates = [
  resolve(here, '../../monorepo.trees.clouds/apps/api.trees.cloud/.env'),
  resolve(here, '../monorepo.trees.clouds/apps/api.trees.cloud/.env'),
];
const apiEnv = apiEnvCandidates.find((p) => existsSync(p));
const localEnv = resolve(here, '.env');

if (apiEnv) {
  const parsed = parse(readFileSync(apiEnv, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== undefined) {
      process.env[key] = value;
    }
  }
}

config({ path: localEnv, override: true });
