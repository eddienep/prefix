import { memo, useCallback, type ReactElement } from 'react'
import {
  Keyboard,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  isCustomRecentPickRow,
  type CaffeinePickerRow,
  type CaffeinePickerSection,
} from './caffeineDb'
import { EntryThumbnail } from './EntryThumbnail'

export type CaffeinePickerPalette = {
  textStrong: string
  text: string
  muted: string
  surface: string
  border: string
  bg: string
}

type Props = {
  palette: CaffeinePickerPalette
  sections: CaffeinePickerSection[]
  onPick: (row: CaffeinePickerRow) => void
  listHeader: ReactElement | null
  emptyHint?: string
}

export const CaffeineSourceList = memo(function CaffeineSourceList({
  palette,
  sections,
  onPick,
  listHeader,
  emptyHint = 'No matches. Try another search.',
}: Props) {
  const renderItem = useCallback(
    ({ item }: { item: CaffeinePickerRow }) => {
      if (isCustomRecentPickRow(item)) {
        return (
          <Pressable
            onPress={() => onPick(item)}
            style={({ pressed }) => [
              styles.row,
              {
                borderBottomColor: palette.border,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}, ${item.mg} milligrams, custom entry`}
          >
            <EntryThumbnail
              thumbnailUrl={undefined}
              entryEmoji={item.entryEmoji}
              surfaceColor={palette.surface}
              borderColor={palette.border}
            />
            <View style={styles.rowText}>
              <Text
                style={[styles.rowTitle, { color: palette.textStrong }]}
                numberOfLines={2}
              >
                {item.label}
              </Text>
              <Text style={[styles.rowMeta, { color: palette.muted }]}>
                {item.mg} mg · Custom
              </Text>
            </View>
          </Pressable>
        )
      }
      return (
        <Pressable
          onPress={() => onPick(item)}
          style={({ pressed }) => [
            styles.row,
            { borderBottomColor: palette.border, opacity: pressed ? 0.82 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${item.mg} milligrams`}
        >
          <EntryThumbnail
            thumbnailUrl={item.image_url}
            surfaceColor={palette.surface}
            borderColor={palette.border}
          />
          <View style={styles.rowText}>
            <Text
              style={[styles.rowTitle, { color: palette.textStrong }]}
              numberOfLines={2}
            >
              {item.name}
            </Text>
            <Text style={[styles.rowMeta, { color: palette.muted }]}>
              {item.mg} mg · {item.oz} fl oz · {item.category}
            </Text>
          </View>
        </Pressable>
      )
    },
    [onPick, palette]
  )

  const renderSectionHeader = useCallback(
    ({
      section,
    }: {
      section: CaffeinePickerSection & { title: string }
    }) => (
      <Pressable
        onPress={() => Keyboard.dismiss()}
        style={({ pressed }) => [
          styles.sectionHeader,
          {
            backgroundColor: palette.bg,
            borderBottomColor: palette.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${section.title}, dismiss keyboard`}
      >
        <Text style={[styles.sectionTitle, { color: palette.textStrong }]}>
          {section.title}
        </Text>
      </Pressable>
    ),
    [palette]
  )

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) =>
        isCustomRecentPickRow(item) ? item.recentKey : item.name
      }
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled
      ListHeaderComponent={listHeader ?? undefined}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={
        Platform.OS === 'ios' ? 'interactive' : 'on-drag'
      }
      onScrollBeginDrag={() => Keyboard.dismiss()}
      style={styles.flex}
      contentContainerStyle={styles.listContent}
      initialNumToRender={14}
      maxToRenderPerBatch={20}
      windowSize={10}
      removeClippedSubviews={false}
      ListEmptyComponent={
        <Pressable onPress={() => Keyboard.dismiss()}>
          <Text style={[styles.empty, { color: palette.muted }]}>
            {emptyHint}
          </Text>
        </Pressable>
      }
    />
  )
})

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: {
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    paddingRight: 8,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: 12,
    marginTop: 3,
  },
  sectionHeader: {
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    fontSize: 14,
  },
})
