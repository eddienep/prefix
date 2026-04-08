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

/** Letterboxing behind URL images (longest side fits the square). */
const THUMB_IMAGE_BG = '#ffffff'

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
  const thumbBg = showEmoji ? surfaceColor : THUMB_IMAGE_BG

  return (
    <View
      style={[
        entryThumbBase,
        {
          borderColor,
          backgroundColor: thumbBg,
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
          resizeMode="contain"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  )
})
