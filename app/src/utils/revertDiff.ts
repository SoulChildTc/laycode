export interface RevertDiffFile {
  filename: string
  additions: number
  deletions: number
}

export function parseRevertDiff(diffText: string): RevertDiffFile[] {
  if (!diffText) return []

  const files: RevertDiffFile[] = []
  const fileBlocks = diffText.split(/\ndiff --git /)

  for (const block of fileBlocks) {
    if (!block.trim()) continue

    const filename = extractFilename(block)
    if (!filename) continue

    let additions = 0
    let deletions = 0

    for (const line of block.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++ ')) additions++
      if (line.startsWith('-') && !line.startsWith('--- ')) deletions++
    }

    if (additions > 0 || deletions > 0) {
      files.push({ filename, additions, deletions })
    }
  }

  return files
}

function extractFilename(block: string): string | null {
  for (const line of block.split('\n')) {
    const m = line.match(/^[+-]{3} (?:[ab]\/)?(.+)/)
    if (m) return m[1]
  }
  return null
}
