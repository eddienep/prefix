import { memo, useCallback, type ReactElement } from 'react'
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native'
import type { CaffeinePickerSection, CaffeineSourceRow } from './caffeineDb'
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
  onPick: (row: CaffeineSourceRow) => void
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
    ({ item }: { item: CaffeineSourceRow }) => (
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
    ),
    [onPick, palette]
  )

  const renderSectionHeader = useCallback(
    ({
      section,
    }: {
      section: CaffeinePickerSection & { title: string }
    }) => (
      <View
        style={[
          styles.sectionHeader,
          {
            backgroundColor: palette.bg,
            borderBottomColor: palette.border,
          },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: palette.textStrong }]}>
          {section.title}
        </Text>
      </View>
    ),
    [palette]
  )

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.name}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled
      ListHeaderComponent={listHeader ?? undefined}
      keyboardShouldPersistTaps="handled"
      style={styles.flex}
      contentContainerStyle={styles.listContent}
      initialNumToRender={14}
      maxToRenderPerBatch={20}
      windowSize={10}
      removeClippedSubviews={false}
      ListEmptyComponent={
        <Text style={[styles.empty, { color: palette.muted }]}>
          {emptyHint}
        </Text>
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
