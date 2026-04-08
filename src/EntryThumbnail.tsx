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
  entryEmoji,
  surfaceColor,
  borderColor,
}: {
  thumbnailUrl?: string
  /** Shown when there is no usable image (e.g. custom log). */
  entryEmoji?: string
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
        <Text
          style={entryThumbEmojiText}
          accessibilityLabel={entryEmoji?.trim() ? 'Entry icon' : 'Coffee'}
        >
          {entryEmoji?.trim() || '☕'}
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
