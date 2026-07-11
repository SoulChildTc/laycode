import { BridgeConfig } from './types.js'
import { loadPersistedConfig } from './store.js'

export function parseArgs(): BridgeConfig {
  const persisted = loadPersistedConfig()
  const args = process.argv.slice(2)
  const config: BridgeConfig = {
    token: persisted.token,
    port: persisted.port,
    opencodeUrl: 'http://localhost:4096',
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--token':
        config.token = args[++i]
        break
      case '--port':
        config.port = parseInt(args[++i], 10)
        break
      case '--opencode-url':
        config.opencodeUrl = args[++i]
        break
    }
  }

  return config
}
