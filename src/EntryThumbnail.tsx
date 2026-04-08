import { memo, useEffect, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'

export const ENTRY_THUMB_SIZE = 44

const entryThumbBase = {
  width: ENTRY_THUMB_SIZE,
  height: ENTRY_THUMB_SIZE,
  borderRadius: 10,
  borderWidth: 1,
  overflow: 'hidden' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  marginRight: 12,
}

const entryThumbEmojiText = { fontSize: 22 }

export const EntryThumbnail = memo(function EntryThumbnail({
  thumbnailUrl,
  surfaceColor,
  borderColor,
}: {
  thumbnailUrl?: string
  surfaceColor: string
  borderColor: string
}) {
  const trimmed = thumbnailUrl?.trim() ?? ''
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [trimmed])

  const showEmoji = !trimmed || failed

  return (
    <View
      style={[
        entryThumbBase,
        {
          borderColor,
          backgroundColor: surfaceColor,
        },
      ]}
    >
      {showEmoji ? (
        <Text style={entryThumbEmojiText} accessibilityLabel="Coffee">
          ☕
        </Text>
      ) : (
        <Image
          source={{ uri: trimmed }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  )
})
