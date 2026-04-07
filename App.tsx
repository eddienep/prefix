import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native'
import { LineChart } from 'react-native-gifted-charts'
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import {
  buildSeries,
  minutesUntilBelowThreshold,
  sleepThresholdMg,
  totalCaffeineAt,
  weightToKg,
} from './src/caffeineMath'
import { loadState, saveState, type ThemePreference } from './src/storage'
import type { AppSettings, CaffeineEntry, WeightUnit } from './src/types'
import { DEFAULT_SETTINGS } from './src/types'

dayjs.extend(localizedFormat)

const PRESETS: { label: string; mg: number }[] = [
  { label: 'Coffee ~95', mg: 95 },
  { label: 'Energy ~160', mg: 160 },
  { label: 'Pre-workout ~200', mg: 200 },
]

const PALETTE = {
  light: {
    bg: '#f8fafc',
    surface: '#ffffff',
    border: '#e2e8f0',
    text: '#475569',
    textStrong: '#0f172a',
    accent: '#0d9488',
    chart: '#0f766e',
    threshold: '#d97706',
    danger: '#dc2626',
    muted: '#64748b',
    inputBg: '#f1f5f9',
  },
  dark: {
    bg: '#0f172a',
    surface: '#1e293b',
    border: '#334155',
    text: '#94a3b8',
    textStrong: '#f1f5f9',
    accent: '#2dd4bf',
    chart: '#5eead4',
    threshold: '#fbbf24',
    danger: '#f87171',
    muted: '#64748b',
    inputBg: '#0f172a',
  },
} as const

type ThemeColors = (typeof PALETTE)[keyof typeof PALETTE]

function formatDurationMinutes(mins: number | null): string {
  if (mins === null) return 'Not within a week'
  if (mins === 0) return 'Already sleep-safe'
  if (mins < 60) return `~${Math.round(mins)} min`
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function downsampleSeries<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr
  const out: T[] = []
  const step = (arr.length - 1) / (max - 1)
  for (let i = 0; i < max; i++) {
    out.push(arr[Math.round(i * step)])
  }
  return out
}

function cycleTheme(p: ThemePreference): ThemePreference {
  if (p === 'system') return 'light'
  if (p === 'light') return 'dark'
  return 'system'
}

function themeLabel(p: ThemePreference): string {
  if (p === 'system') return 'Theme: Auto'
  if (p === 'light') return 'Theme: Light'
  return 'Theme: Dark'
}

function effectiveScheme(
  preference: ThemePreference,
  system: 'light' | 'dark' | null | undefined
): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference
  return system === 'dark' ? 'dark' : 'light'
}

function Screen() {
  const systemScheme = useColorScheme()
  const insets = useSafeAreaInsets()
  const [entries, setEntries] = useState<CaffeineEntry[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [themePreference, setThemePreference] =
    useState<ThemePreference>('system')
  const [hydrated, setHydrated] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const [formMg, setFormMg] = useState('95')
  const [consumptionAt, setConsumptionAt] = useState(() => new Date())
  const [showPicker, setShowPicker] = useState(false)
  const [formLabel, setFormLabel] = useState('')

  const [route, setRoute] = useState<'home' | 'settings'>('home')
  const [draftSettings, setDraftSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [draftTheme, setDraftTheme] = useState<ThemePreference>('system')

  const openSettings = useCallback(() => {
    setDraftSettings({ ...settings })
    setDraftTheme(themePreference)
    setRoute('settings')
  }, [settings, themePreference])

  const saveSettingsAndClose = useCallback(() => {
    const half = Math.max(0.5, Number(draftSettings.halfLifeHours) || 5)
    const w = Math.max(1, Number(draftSettings.weightValue) || DEFAULT_SETTINGS.weightValue)
    setSettings({
      ...draftSettings,
      halfLifeHours: half,
      weightValue: w,
    })
    setThemePreference(draftTheme)
    setRoute('home')
  }, [draftSettings, draftTheme])

  const closeSettingsWithoutSave = useCallback(() => {
    setRoute('home')
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await loadState()
      if (cancelled) return
      setEntries(s.entries)
      setSettings(s.settings)
      setThemePreference(s.themePreference)
      setHydrated(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    void saveState({ entries, settings, themePreference })
  }, [entries, settings, themePreference, hydrated])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const scheme = effectiveScheme(
    route === 'settings' ? draftTheme : themePreference,
    systemScheme
  )
  const c = PALETTE[scheme]

  const weightKg = weightToKg(settings.weightValue, settings.weightUnit)
  const thresholdMg = sleepThresholdMg(weightKg)
  const currentMg = totalCaffeineAt(entries, now, settings.halfLifeHours)
  const untilSafe = minutesUntilBelowThreshold(
    entries,
    settings.halfLifeHours,
    thresholdMg,
    now,
    5,
    168
  )

  const chartSeries = useMemo(() => {
    const start = dayjs(now).subtract(24, 'hour').toDate()
    const end = dayjs(now).add(12, 'hour').toDate()
    return buildSeries(entries, start, end, settings.halfLifeHours, 5)
  }, [entries, now, settings.halfLifeHours])

  const lineData = useMemo(() => {
    const sampled = downsampleSeries(chartSeries, 64).map((p) => ({
      value: Math.round(p.caffeine_mg * 10) / 10,
    }))
    if (sampled.length === 0) return [{ value: 0 }, { value: 0 }]
    if (sampled.length === 1) return [sampled[0], { ...sampled[0] }]
    return sampled
  }, [chartSeries])

  const chartMax = useMemo(() => {
    const peak = Math.max(
      ...lineData.map((d) => d.value),
      thresholdMg,
      10
    )
    return Math.ceil(peak * 1.12)
  }, [lineData, thresholdMg])

  const chartWidth = Math.max(260, Dimensions.get('window').width - 48)

  const addEntry = useCallback(() => {
    const mg = Number(formMg)
    if (!Number.isFinite(mg) || mg <= 0) return
    const entry: CaffeineEntry = {
      id: newId(),
      timestamp: consumptionAt.toISOString(),
      caffeine_mg: mg,
      label: formLabel.trim() || 'Caffeine',
    }
    setEntries((prev) => [...prev, entry])
    setFormLabel('')
  }, [formMg, consumptionAt, formLabel])

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [entries]
  )

  const styles = useMemo(() => makeStyles(c), [c])

  if (!hydrated) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={{ marginTop: 12, color: c.text }}>Loading…</Text>
      </View>
    )
  }

  if (route === 'settings') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: 24 + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.settingsTopBar}>
              <Pressable
                onPress={closeSettingsWithoutSave}
                style={({ pressed }) => [
                  styles.backBtn,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                hitSlop={12}
              >
                <Ionicons name="chevron-back" size={26} color={c.accent} />
                <Text style={styles.backBtnText}>Back</Text>
              </Pressable>
            </View>

            <Text style={styles.settingsScreenTitle}>Settings</Text>
            <Text style={styles.settingsSubcopy}>
              Update body weight, half-life, and appearance. Tap Save to apply.
            </Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Body & metabolism</Text>
              <Text style={styles.label}>Body weight</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={String(draftSettings.weightValue)}
                onChangeText={(t) =>
                  setDraftSettings((s) => ({
                    ...s,
                    weightValue: Number(t.replace(',', '.')) || 0,
                  }))
                }
              />
              <View style={styles.unitRow}>
                {(['kg', 'lb'] as const).map((u) => (
                  <Pressable
                    key={u}
                    onPress={() =>
                      setDraftSettings((s) => ({
                        ...s,
                        weightUnit: u as WeightUnit,
                      }))
                    }
                    style={[
                      styles.unitChip,
                      draftSettings.weightUnit === u && styles.unitChipOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.unitChipText,
                        draftSettings.weightUnit === u && styles.unitChipTextOn,
                      ]}
                    >
                      {u}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.label, { marginTop: 12 }]}>
                Caffeine half-life (hours)
              </Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={String(draftSettings.halfLifeHours)}
                onChangeText={(t) =>
                  setDraftSettings((s) => ({
                    ...s,
                    halfLifeHours: Math.max(
                      0.5,
                      Number(t.replace(',', '.')) || 5
                    ),
                  }))
                }
              />
              <Text style={styles.hint}>Typical average ~5 h.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Appearance</Text>
              <Pressable
                onPress={() =>
                  setDraftTheme((prev) => cycleTheme(prev))
                }
                style={({ pressed }) => [
                  styles.themeBtn,
                  styles.themeBtnBlock,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.themeBtnText}>
                  {themeLabel(draftTheme)}
                </Text>
              </Pressable>
              <Text style={styles.hint}>
                Cycles auto → light → dark. Saved with the button below.
              </Text>
            </View>

            <Pressable
              style={styles.primaryBtn}
              onPress={saveSettingsAndClose}
            >
              <Text style={styles.primaryBtnText}>Save changes</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.title}>Caffeine half-life</Text>
              <Text style={styles.tagline}>
                Decay curve vs a simple sleep-safe line (1.5 mg/kg). Awareness
                only—not medical advice.
              </Text>
            </View>
            <Pressable
              onPress={openSettings}
              accessibilityLabel="Open settings"
              style={({ pressed }) => [
                styles.gearBtn,
                { opacity: pressed ? 0.65 : 1 },
              ]}
              hitSlop={10}
            >
              <Ionicons
                name="settings-outline"
                size={26}
                color={c.textStrong}
              />
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Log caffeine</Text>
            <Text style={styles.label}>Amount (mg)</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={formMg}
              onChangeText={setFormMg}
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Time</Text>
            <Pressable
              onPress={() => setShowPicker(true)}
              style={styles.dateBtn}
            >
              <Text style={styles.dateBtnText}>
                {dayjs(consumptionAt).format('lll')}
              </Text>
            </Pressable>
            {showPicker && (
              <DateTimePicker
                value={consumptionAt}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, date) => {
                  if (Platform.OS === 'android') setShowPicker(false)
                  if (date) setConsumptionAt(date)
                }}
              />
            )}
            {Platform.OS === 'ios' && showPicker && (
              <Pressable
                style={styles.donePicker}
                onPress={() => setShowPicker(false)}
              >
                <Text style={styles.donePickerText}>Done</Text>
              </Pressable>
            )}
            <Text style={[styles.label, { marginTop: 12 }]}>
              Label (optional)
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. coffee"
              placeholderTextColor={c.muted}
              value={formLabel}
              onChangeText={setFormLabel}
            />
            <Pressable style={styles.primaryBtn} onPress={addEntry}>
              <Text style={styles.primaryBtnText}>Add entry</Text>
            </Pressable>
            <View style={styles.presetRow}>
              {PRESETS.map((p) => (
                <Pressable
                  key={p.label}
                  onPress={() => setFormMg(String(p.mg))}
                  style={styles.presetChip}
                >
                  <Text style={styles.presetChipText}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {sortedEntries.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Recent entries</Text>
              {sortedEntries.map((e) => (
                <View key={e.id} style={styles.entryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryTitle}>
                      {e.caffeine_mg} mg · {e.label}
                    </Text>
                    <Text style={styles.entryMeta}>
                      {dayjs(e.timestamp).format('lll')}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeEntry(e.id)} hitSlop={8}>
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Active caffeine</Text>
            <Text style={styles.chartCaption}>
              Last 24h → next 12h. Dashed line ≈ sleep-safe ({thresholdMg.toFixed(0)}{' '}
              mg).
            </Text>
            <View style={styles.chartBox}>
              <LineChart
                data={lineData}
                width={chartWidth}
                height={200}
                spacing={
                  lineData.length > 1
                    ? (chartWidth - 24) / (lineData.length - 1)
                    : 40
                }
                initialSpacing={12}
                endSpacing={12}
                color={c.chart}
                thickness={2}
                hideDataPoints
                yAxisColor={c.border}
                xAxisColor={c.border}
                rulesColor={c.border}
                yAxisTextStyle={{ color: c.muted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: c.muted, fontSize: 9 }}
                maxValue={chartMax}
                noOfSections={4}
                yAxisOffset={4}
                showReferenceLine1
                referenceLine1Position={thresholdMg}
                referenceLine1Config={{
                  color: c.threshold,
                  thickness: 2,
                  type: 'dashed',
                  dashWidth: 6,
                  dashGap: 4,
                }}
                isAnimated={false}
              />
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>Current</Text>
                <Text style={styles.statValue}>{currentMg.toFixed(0)} mg</Text>
              </View>
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>Until sleep-safe</Text>
                <Text style={[styles.statValue, styles.statValueSmall]}>
                  {formatDurationMinutes(untilSafe)}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.disclaimer}>
            Fixed half-life and a rough mg/kg cutoff for education only. Not
            medical advice.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    safe: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingsTopBar: { marginBottom: 4 },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 2,
      paddingVertical: 6,
      paddingRight: 12,
    },
    backBtnText: { fontSize: 17, color: c.accent, fontWeight: '600' },
    settingsScreenTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: c.textStrong,
      marginTop: 4,
      letterSpacing: -0.5,
    },
    settingsSubcopy: {
      fontSize: 14,
      color: c.text,
      marginTop: 8,
      marginBottom: 16,
      lineHeight: 20,
    },
    gearBtn: {
      padding: 10,
      marginTop: -2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 16,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: c.textStrong,
      letterSpacing: -0.3,
    },
    tagline: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 20,
      color: c.text,
    },
    themeBtn: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: c.surface,
    },
    themeBtnText: { fontSize: 14, color: c.textStrong, fontWeight: '600' },
    themeBtnBlock: {
      alignSelf: 'stretch',
      alignItems: 'center',
      paddingVertical: 12,
      marginTop: 4,
      borderRadius: 10,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginBottom: 14,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: c.textStrong,
      marginBottom: 12,
    },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: c.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: c.textStrong,
      backgroundColor: c.inputBg,
    },
    hint: { marginTop: 8, fontSize: 12, color: c.muted },
    unitRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    unitChip: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      backgroundColor: c.inputBg,
    },
    unitChipOn: {
      borderColor: c.accent,
      backgroundColor:
        schemeTint(c.accent, c.surface === '#ffffff' ? 0.12 : 0.2) ?? c.inputBg,
    },
    unitChipText: { fontSize: 14, color: c.text },
    unitChipTextOn: { fontWeight: '700', color: c.textStrong },
    dateBtn: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      backgroundColor: c.inputBg,
    },
    dateBtnText: { fontSize: 15, color: c.textStrong },
    donePicker: { alignSelf: 'flex-end', marginTop: 8 },
    donePickerText: { color: c.accent, fontWeight: '600', fontSize: 15 },
    primaryBtn: {
      marginTop: 16,
      backgroundColor: c.accent,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    presetChip: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    presetChipText: { fontSize: 12, color: c.textStrong },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    entryTitle: { fontSize: 15, fontWeight: '600', color: c.textStrong },
    entryMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
    removeText: { fontSize: 14, color: c.danger, fontWeight: '600' },
    chartCaption: { fontSize: 12, color: c.muted, marginBottom: 8 },
    chartBox: { alignItems: 'center', marginVertical: 4 },
    statsRow: { flexDirection: 'row', marginTop: 16, gap: 16 },
    statCol: { flex: 1 },
    statLabel: { fontSize: 12, color: c.muted },
    statValue: { fontSize: 28, fontWeight: '700', color: c.textStrong },
    statValueSmall: { fontSize: 18 },
    disclaimer: {
      fontSize: 11,
      color: c.muted,
      lineHeight: 16,
      marginTop: 8,
    },
  })
}

/** Simple tint for chip background — fallback solid if parse fails */
function schemeTint(hex: string, alpha: number): string | undefined {
  const m = hex.replace('#', '')
  if (m.length !== 6) return undefined
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return undefined
  return `rgba(${r},${g},${b},${alpha})`
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Screen />
    </SafeAreaProvider>
  )
}
