  import { defineConfig } from 'vite'
  import react from '@vitejs/plugin-react'
  import path from 'path'

  export default defineConfig({
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
    server: {
      port: 3000,
      watch: {
        // Игнорируй изменения в этих файлах
        ignored: [
          '**/.env',
          '**/.env.local',
          '**/.env.production',
          '**/.env.development',
          '**/.git/**',
          '**/node_modules/**',
          '**/.vite/**'
        ]
      },
      hmr: {
        overlay: false
      }
    },
    optimizeDeps: {
      force: false,
      include: ['react', 'react-dom', 'lucide-react', '@supabase/supabase-js']
    }
  })
