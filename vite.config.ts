import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import {defineConfig} from 'vite'

/** The page lives in web/ and builds to dist/web, which Vercel serves and Express serves locally */
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: {outDir: '../dist/web', emptyOutDir: true},
  server: {proxy: {'/api': 'http://127.0.0.1:3000'}}
})
