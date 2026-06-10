import React, { useMemo } from 'react'
import { View } from 'react-native'
import TextPart from './TextPart'
import CodeBlockWrapper from './CodeBlockWrapper'
import { segmentText } from '../utils/segmentParts'
import type { Theme } from '../theme'

interface Props {
  content: string
  theme: Theme
}

export default function ContentRenderer({ content, theme }: Props) {
  const segments = useMemo(() => segmentText(content), [content])

  return (
    <View>
      {segments.map((seg, idx) => {
        if (seg.type === 'reasoning') return null
        if (seg.type === 'code') {
          return <CodeBlockWrapper key={idx} language={seg.language || 'text'} content={seg.content} theme={theme} />
        }
        return <TextPart key={idx} text={seg.content} theme={theme} isUser={false} />
      })}
    </View>
  )
}