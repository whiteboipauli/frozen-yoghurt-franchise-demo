import { defineConfig } from 'vite'
export default defineConfig({
  build: { ssr: true, target: 'node22', minify: false, emptyOutDir: true, rollupOptions: { output: { entryFileNames: '[name].mjs' } } },
  ssr: { noExternal: true },
})
