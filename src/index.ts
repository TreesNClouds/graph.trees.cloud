import './load-env';
import express, { type RequestHandler } from 'express';
import { cubeGraphqlYoga } from './graphql';
import { portalRouter } from './portal/routes';

const PORT = Number(process.env.PORT || 3400);
const API_UPSTREAM = (process.env.API_TREES_CLOUD_URL || 'http://127.0.0.1:3333').replace(/\/$/, '');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'http://localhost:3401');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use('/api/v2/portal', portalRouter);

/** Platform tasks live on api.trees.cloud. This mount only forwards. */
app.use('/api/v2/tasks', async (req, res) => {
  try {
    const dest = `${API_UPSTREAM}/api/v2/tasks${req.url}`;
    const incoming = req.headers.authorization;
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const r = await fetch(dest, {
      method: req.method,
      headers: {
        accept: req.headers.accept ?? 'application/json',
        ...(incoming ? { authorization: incoming } : {}),
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
      },
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
    });
    res.status(r.status);
    const ct = r.headers.get('content-type');
    if (ct) res.setHeader('content-type', ct);
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (err) {
    res.status(502).json({
      success: false,
      error: `api.trees.cloud unavailable at ${API_UPSTREAM}`,
      detail: (err as Error).message,
    });
  }
});

app.get('/health', (_req, res) => {
  res.json({
    service: 'v2.trees.cloud',
    status: 'ok',
    graphql: '/api/v2/graphql',
    portal: '/api/v2/portal',
    tasks: '/api/v2/tasks → api.trees.cloud',
    apiUpstream: API_UPSTREAM,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/v2/graphql', (_req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' http://localhost:3401 http://127.0.0.1:3401",
  );
  next();
});
app.use('/api/v2/graphql', cubeGraphqlYoga as unknown as RequestHandler);

/** Cube HTML/assets (GraphiQL logo, shells) still live on api.trees.cloud. */
app.use('/api/v2/cube', async (req, res) => {
  try {
    const dest = `${API_UPSTREAM}/api/v2/cube${req.url}`;
    const incoming = req.headers.authorization;
    const r = await fetch(dest, {
      method: req.method,
      headers: {
        accept: req.headers.accept ?? '*/*',
        ...(incoming ? { authorization: incoming } : {}),
      },
    });
    res.status(r.status);
    const ct = r.headers.get('content-type');
    if (ct) res.setHeader('content-type', ct);
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (err) {
    res.status(502).json({
      success: false,
      error: `api.trees.cloud unavailable at ${API_UPSTREAM}`,
      detail: (err as Error).message,
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`v2.trees.cloud  http://localhost:${PORT}`);
  console.log(`Portal API      http://localhost:${PORT}/api/v2/portal`);
  console.log(`Tasks proxy     http://localhost:${PORT}/api/v2/tasks → ${API_UPSTREAM}`);
  console.log(`GraphQL         http://localhost:${PORT}/api/v2/graphql`);
  console.log(`api upstream    ${API_UPSTREAM}`);
});
