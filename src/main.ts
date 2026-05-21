import { loadConfig, loadDotenvIntoEnv } from './env.ts';
import { handleHttpWithState } from './handlers.ts';
import { HubState } from './state.ts';

const dotenvPath = Deno.env.get('DOTENV_PATH') ?? '.env';
try {
  loadDotenvIntoEnv(dotenvPath);
} catch {
  // Optional local env file.
}

const config = loadConfig();
const state = new HubState();

Deno.serve(
  { hostname: config.host, port: config.port },
  (req) => handleHttpWithState(req, config, state),
);
