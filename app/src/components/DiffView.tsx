interface DiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: DiffLine[] = []

  let oi = 0, ni = 0
  while (oi < oldLines.length && ni < newLines.length) {
    if (oldLines[oi] === newLines[ni]) {
      result.push({ type: 'same', text: oldLines[oi] })
      oi++
      ni++
    } else {
      const nextMatch = newLines.indexOf(oldLines[oi], ni)
      if (nextMatch > ni && nextMatch - ni < 5) {
        while (ni < nextMatch) {
          result.push({ type: 'add', text: newLines[ni] })
          ni++
        }
      } else {
        result.push({ type: 'remove', text: oldLines[oi] })
        oi++
      }
    }
  }

  while (oi < oldLines.length) {
    result.push({ type: 'remove', text: oldLines[oi] })
    oi++
  }
  while (ni < newLines.length) {
    result.push({ type: 'add', text: newLines[ni] })
    ni++
  }

  return result
}

export function getDiffText(oldString: string, newString: string): string {
  const lines = computeDiff(oldString, newString)
  return lines.map(line => {
    const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
    return `${prefix} ${line.text}`
  }).join('\n')
}
