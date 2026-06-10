import { BridgeConfig } from './types.js'

export function parseArgs(): BridgeConfig {
  const args = process.argv.slice(2)
  const config: BridgeConfig = {
    token: 'laycode',
    port: 8079,
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

export function printStartupInfo(config: BridgeConfig) {
  console.log(`LayCode Bridge v0.1.0`)
  console.log(`  Port:        ${config.port}`)
  console.log(`  Token:       ${config.token}`)
  console.log(`  mDNS:        _laycode._tcp (auto-discovery)`)
  console.log(`  Token auth:  enabled`)
}
