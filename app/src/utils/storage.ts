export function storageKey(serverId: string | undefined, suffix: string): string {
  return serverId ? `@laycode/${serverId}/${suffix}` : `@laycode/${suffix}`
}
