import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { BUILD_INFO_FILE, checkBuildConfig, checkOutputDir, createBuildInfo } from './src/config/deployment.ts'

// The front end reads env files only from frontend-env/, never the server's root .env: that file holds server secrets
// and NODE_ENV=development, which made `vite build` emit a development bundle. Process environment variables
// (e.g. VITE_API_BASE_URL set by CI or Playwright) still apply.
const envDir = 'frontend-env'

/**
 * Build-only checks that need Vite's resolved config (the CLI --outDir is not visible to the config function), and a
 * build-info.json record in every bundle so `npm run verify:artifact` can tell deployable builds from e2e/mock ones.
 */
function deploymentGuard(mode: string, viteEnv: Record<string, string>): Plugin {
  return {
    name: 'algoflow-deployment-guard',
    apply: 'build',
    configResolved(config) {
      const errors = checkOutputDir({ mode, outDir: config.build.outDir })
      if (errors.length > 0) {
        throw new Error(`Unsafe build configuration (mode "${mode}"):\n  - ${errors.join('\n  - ')}`)
      }
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: BUILD_INFO_FILE,
        source: `${JSON.stringify(createBuildInfo(mode, viteEnv), null, 2)}\n`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const viteEnv = loadEnv(mode, envDir, 'VITE_')
  // Fail the build (not just warn) on a mock-API build, a missing/unsafe API base URL, or a development NODE_ENV.
  // See src/config/deployment.ts.
  const errors = checkBuildConfig({
    command,
    mode,
    env: viteEnv,
    nodeEnv: loadEnv(mode, envDir, '').NODE_ENV,
  })
  if (errors.length > 0) {
    throw new Error(`Unsafe build configuration (mode "${mode}"):\n  - ${errors.join('\n  - ')}`)
  }

  return {
    envDir,
    plugins: [react(), deploymentGuard(mode, viteEnv)],
    server: {
      // Development only: `vite build` output never uses this proxy (VITE_API_BASE_URL is required instead)
      proxy: {
        '/api': {
          // 127.0.0.1, not localhost: the backend listens on IPv4 loopback in development, and localhost can
          // resolve to ::1 first
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
      },
    },
  }
})
