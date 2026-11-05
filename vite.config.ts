import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base "./": relative Pfade, damit die App auch unter https://<login>.github.io/<repo>/ läuft
export default defineConfig({ base: './', plugins: [react()] })
