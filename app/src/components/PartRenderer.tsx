import React from 'react'
import { View, Text } from 'react-native'
import TextPart from './TextPart'
import ReasoningPart from './ReasoningPart'
import ToolPart from './ToolPart'
import FilePart from './FilePart'
import PatchPart from './PatchPart'

const COMPACT_TOOLS = new Set(['webfetch', 'browser', 'fetch'])

interface Props {
  parts: any[]
  theme: any
  isUser: boolean
}

export default function PartRenderer({ parts, theme, isUser }: Props) {
  return (
    <View>
      {parts.map((part: any) => {
        switch (part.type) {
          case 'text':
            return <TextPart key={part.id || Math.random()} text={part.text} theme={theme} isUser={isUser} />
          case 'reasoning':
            return <ReasoningPart key={part.id || Math.random()} text={part.text} theme={theme} />
          case 'tool':
            return <ToolPart key={part.id || Math.random()} tool={part} theme={theme} compact={COMPACT_TOOLS.has(part.tool)} />
          case 'file':
            return <FilePart key={part.id || Math.random()} file={part} theme={theme} />
          case 'patch':
            return <PatchPart key={part.id || Math.random()} patch={part} theme={theme} />
          case 'agent':
            return <View key={part.id || Math.random()} style={{ marginVertical: 2 }}><Text style={{ fontSize: 12, color: theme.textSecondary, fontStyle: 'italic' }}>🤖 {part.name}</Text></View>
          case 'step-start':
          case 'step-finish':
          case 'snapshot':
          case 'compaction':
            return null
          default:
            return null
        }
      })}
    </View>
  )
}