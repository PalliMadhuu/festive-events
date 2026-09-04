import { config } from 'dotenv';
config();

import { serve } from '@hono/node-server';
import app from './app.js';

const port = Number(process.env.PORT || 3001);
const hostname = process.env.HOST || '0.0.0.0';

serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(`Festive Events API listening on http://${hostname}:${port}`);
});
