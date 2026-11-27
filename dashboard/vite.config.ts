import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function cafetoOffline(): Plugin {
  return {
    name: 'cafeto-offline',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const datos = ['data/cafeto.json', 'data/Acopio_Hernan_vinculado_repo.xlsx'];
        const shell = [...new Set(['index.html', ...Object.keys(bundle), ...datos])].sort();
        const worker = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
        const hash = createHash('sha256').update(worker).update(JSON.stringify(shell));
        datos.forEach((dato) => hash.update(readFileSync(new URL(`./public/${dato}`, import.meta.url))));
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: worker
            .replace('__CAFETO_CACHE__', `cafeto-shell-${hash.digest('hex').slice(0, 12)}`)
            .replace('__CAFETO_ASSETS__', JSON.stringify(shell)),
        });
        this.emitFile({
          type: 'asset',
          fileName: 'staticwebapp.config.json',
          source: readFileSync(new URL('./staticwebapp.config.json', import.meta.url)),
        });
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), cafetoOffline()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:7071',
        changeOrigin: true,
      },
    },
  },
});
