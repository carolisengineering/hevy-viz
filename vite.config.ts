import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { blockPublicPersonalData, servePersonalData } from './plugins/personal-data.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), servePersonalData(), blockPublicPersonalData()],
})
