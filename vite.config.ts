import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Path aset relatif agar folder dist dapat disajikan dari subfolder atau server statis LAN.
  base: './',
  plugins: [react()],
})
