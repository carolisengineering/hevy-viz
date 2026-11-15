import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { defineConfig, type Plugin } from 'vite'

/** Where `npm run sync` writes personal data. Outside public/ so builds never ship it. */
const SYNCED_DATA_FILE = 'data/hevy.json'

/** Dev-only: serve the synced file at /data/hevy.json, as if it lived in public/. */
function servePersonalData(): Plugin {
  return {
    name: 'serve-personal-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/data/hevy.json', async (_req, res, next) => {
        try {
          const body = await readFile(SYNCED_DATA_FILE)
          res.setHeader('content-type', 'application/json')
          res.end(body)
        } catch {
          next() // Not synced yet: the app falls back to the sample.
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), servePersonalData()],
})
