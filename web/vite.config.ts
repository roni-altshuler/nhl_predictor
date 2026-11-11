import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const base = process.env.APP_BASE_PATH || '/'
if (!['/', '/nhl_predictor/'].includes(base)) throw new Error('Unsupported app base path')

export default defineConfig({
  base,
  plugins: [react()],
  define: {
    __APP_COMMIT__: JSON.stringify(process.env.APP_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local-preview'),
  },
  build: { target: 'es2022', sourcemap: false },
})
