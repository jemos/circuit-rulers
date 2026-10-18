import { defineConfig, type Connect } from 'vite';
import react from '@vitejs/plugin-react';

// The docs in public/docs use clean URLs (/docs/rulers), which Cloudflare's asset
// serving resolves to rulers.html. Do the same in dev and preview.
const docsUrls: Connect.NextHandleFunction = (incoming, res, next) => {
  const req = incoming as typeof incoming & { url?: string }; // no @types/node here
  const [path, query = ''] = (req.url ?? '').split('?');
  if (path === '/docs') {
    res.statusCode = 302;
    res.setHeader('Location', '/docs/' + (query && `?${query}`));
    res.end();
    return;
  }
  const m = path.match(/^\/docs\/([\w-]*)$/);
  if (m) req.url = `/docs/${m[1] || 'index'}.html` + (query && `?${query}`);
  next();
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'docs-clean-urls',
      configureServer: (server) => void server.middlewares.use(docsUrls),
      configurePreviewServer: (server) => void server.middlewares.use(docsUrls),
    },
  ],
});
