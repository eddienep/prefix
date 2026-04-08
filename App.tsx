import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { StatusBar } from 'expo-status-bar'
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  BackHandler,
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
  dateWhenBelowThreshold,
  sleepThresholdMg,
  totalCaffeineAt,
  weightToKg,
  type ChartPoint,
} from './src/caffeineMath'
import { loadState, saveState, type ThemePreference } from './src/storage'
import type { AppSettings, CaffeineEntry, WeightUnit } from './src/types'

const PREFIX_LOGO_DARK_THEME = require('./assets/prefixlogowhite.png')
const PREFIX_LOGO_LIGHT_THEME = require('./assets/prefixlogoblack.png')
/** Behind white logo in header (dark theme only). */
const PREFIX_LOGO_CHIP_BG_DARK = '#0f172a'
import { DEFAULT_SETTINGS } from './src/types'

dayjs.extend(localizedFormat)

const PRESETS: { label: string; mg: number }[] = [
  { label: 'Coffee ~95', mg: 95 },
  { label: 'Energy ~160', mg: 160 },
  { label: 'Pre-workout ~200', mg: 200 },
]

/** Sample interval for scrollable timeline (minutes). */
const CHART_STEP_MIN = 60
const INITIAL_PAST_DAYS = 21
const INITIAL_FUTURE_DAYS = 21
const EXTEND_DAYS = 14
/** Minimum pixels between hourly samples (also used as floor when deriving spacing). */
const CHART_MIN_POINT_SPACING = 5
/** Aim for ~this many hours of timeline visible in the viewport at once (hourly points). */
const CHART_HOURS_IN_VIEWPORT = 24
/** 0 keeps grid/x-axis aligned with the left edge (gifted-charts scroll `paddingLeft` otherwise hides rules). */
const CHART_INITIAL_SPACING = 0
const CHART_END_SPACING = 12
const CHART_HEIGHT = 240
/**
 * Y-axis gutter removed (`yAxisLabelWidth` / `yAxisThickness` = 0); labels float in-plot via
 * `floatingYAxisLabels` + `yAxisLabelContainerStyle.width`.
 */
const CHART_FLOATING_Y_LABEL_W = 56
/**
 * Nudge floating Y labels down so they sit just under the horizontal grid lines.
 * Use layout (`paddingTop` on `yAxisLabelContainerStyle`), not `translateY` on the Text:
 * RN often applies Text `transform` only after a second layout pass, so cold start ignores
 * the nudge until something remounts (e.g. Fast Refresh).
 */
const CHART_FLOATING_Y_LABEL_NUDGE_Y = 10
/** Must match `xAxisThickness` on `LineChart`. */
const CHART_X_AXIS_THICKNESS = 1
/**
 * “Now” vertical line is drawn in RN (not gifted-charts SVG). Height is derived from
 * `onLayout` on the chart block so it matches the real LineChart outer box; reserve the
 * bottom band for x-axis + labels (must stay in sync with LineChart props below).
 */
const CHART_NOW_LINE_TOP = 10
/** Must match `xAxisLabelsHeight` on `LineChart`. */
const CHART_X_AXIS_LABELS_H = 28
/**
 * Gifted-charts adds extra vertical chrome (+50, scroll insets, etc.); the x-axis sits above
 * the full `labels + shift + labelsExtraHeight` band. Trim reserve so the line meets the axis.
 */
const CHART_NOW_LINE_BOTTOM_RESERVE_TRIM = 5
/** Time label above the line (negative = above chart top). */
const CHART_NOW_TIME_TOP = -10
/** Pushes the plot + x-axis line up so labels (fixed to scroll bottom) sit below the line. */
const CHART_X_AXIS_LABEL_SHIFT = 12
/** Y-axis grid step and tick labels (mg). */
const CHART_Y_STEP_MG = 50
/** X-axis label on each local hour where hour % N === 0 (hourly data, on-the-hour). */
const X_LABEL_EVERY_H = 3
/**
 * Gifted-charts x-axis label cell width is `spacing + labelsExtraHeight` (see LineChart renderLabel).
 * Without enough total width, `h:mm A` ellipsizes (e.g. "7:0…").
 */
const X_AXIS_LABEL_MIN_SLOT_WIDTH = 52

const chartNowOverlayText = StyleSheet.create({
  text: {
    width: 72,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '600',
  },
})

/** Text only — memoized so horizontal scroll does not re-render the time string. */
const ChartNowTimeOverlayLabel = memo(function ChartNowTimeOverlayLabel({
  label,
  color,
}: {
  label: string
  color: string
}) {
  return (
    <Text
      pointerEvents="none"
      style={[chartNowOverlayText.text, { color }]}
    >
      {label}
    </Text>
  )
})

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

/** Wall-clock time when caffeine first drops to the sleep-safe threshold (local). */
function formatSleepSafeAt(at: Date | null, alreadySleepSafe: boolean): string {
  if (alreadySleepSafe) return 'Now'
  if (at == null) return 'Not within a week'
  const d = dayjs(at)
  const today = dayjs()
  if (d.isSame(today, 'day')) return d.format('h:mm A')
  if (d.isSame(today.add(1, 'day'), 'day'))
    return `Tomorrow, ${d.format('h:mm A')}`
  return d.format('ddd, MMM D · h:mm A')
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
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

function pointsPerDayFromStep(stepMin: number): number {
  return Math.max(1, Math.round(1440 / stepMin))
}

/**
 * Horizontal position of “now” in gifted-charts ScrollView **content** coordinates.
 * BarAndLineChartsWrapper uses `paddingLeft: initialSpacing` and SVG x from `getX`, where
 * `getX(i) = initialSpacing + i * spacing` (uniform spacing). A data point’s content-x is
 * therefore `initialSpacing + getX(i) = 2 * initialSpacing + i * spacing`.
 *
 * Interpolates between samples by wall time; extrapolates at most one segment past the last
 * point when `now` is slightly past the final sample (avoids snapping a full hour left).
 */
function nowLineXInScrollContentCoords(
  series: ChartPoint[],
  nowMs: number,
  initialSpacing: number,
  pointSpacing: number
): number {
  const x0 = 2 * initialSpacing
  if (series.length < 2) return x0

  const tFirst = series[0].t
  const tLast = series[series.length - 1].t

  if (nowMs <= tFirst) return x0

  if (nowMs >= tLast) {
    const base = x0 + (series.length - 1) * pointSpacing
    const tPrev = series[series.length - 2].t
    const span = tLast - tPrev
    if (span <= 0) return base
    const extraFrac = (nowMs - tLast) / span
    return base + Math.max(0, Math.min(1, extraFrac)) * pointSpacing
  }

  for (let i = 0; i < series.length - 1; i++) {
    const t0 = series[i].t
    const t1 = series[i + 1].t
    if (nowMs >= t0 && nowMs <= t1) {
      const span = t1 - t0
      const frac = span > 0 ? (nowMs - t0) / span : 0
      return x0 + (i + frac) * pointSpacing
    }
  }

  return x0
}

function buildScrollableLineData(series: ChartPoint[], muted: string) {
  if (series.length === 0) {
    return {
      lineData: [
        {
          value: 0,
          label: ' ',
          labelTextStyle: { fontSize: 9, color: muted },
        },
        {
          value: 0,
          label: ' ',
          labelTextStyle: { fontSize: 9, color: muted },
        },
      ],
    }
  }

  /**
   * Always pass real time text for every point (hourly samples). Gifted-charts lays out each
   * x-axis cell; alternating `' '` vs `'3 PM'` caused remeasure/jank every 3 h along the axis
   * when scrolling or when the now-line moved. Hidden slots use opacity 0 but identical string.
   */
  const lineData = series.map((p, i) => {
    const d = dayjs(p.t)
    const onClockGrid =
      d.minute() === 0 && d.hour() % X_LABEL_EVERY_H === 0
    const showTimeLabel = onClockGrid || i === series.length - 1
    const label = d.format('h A')

    return {
      value: Math.round(p.caffeine_mg * 10) / 10,
      label,
      labelTextStyle: {
        fontSize: 10,
        color: muted,
        textAlign: 'center' as const,
        opacity: showTimeLabel ? 1 : 0,
      },
    }
  })

  return { lineData }
}

type ConsumptionDayGroup = {
  dayKey: string
  label: string
  entries: CaffeineEntry[]
}

/** Preserves `sorted` order within each calendar day (newest first per day). */
function groupEntriesByConsumptionDay(
  sorted: CaffeineEntry[]
): ConsumptionDayGroup[] {
  const today = dayjs().startOf('day')
  const yesterday = today.subtract(1, 'day')
  const map = new Map<string, CaffeineEntry[]>()
  for (const e of sorted) {
    const key = dayjs(e.timestamp).format('YYYY-MM-DD')
    const arr = map.get(key)
    if (arr) arr.push(e)
    else map.set(key, [e])
  }
  const keys = [...map.keys()].sort((a, b) => b.localeCompare(a))
  return keys.map((dayKey) => {
    const d = dayjs(dayKey, 'YYYY-MM-DD')
    let label: string
    if (d.isSame(today, 'day')) label = 'Today'
    else if (d.isSame(yesterday, 'day')) label = 'Yesterday'
    else label = d.format('dddd, MMMM D, YYYY')
    return { dayKey, label, entries: map.get(dayKey)! }
  })
}

/**
 * Log overlay: plain `View` on iOS + `ScrollView` keyboard insets; `KeyboardAvoidingView`
 * on Android. (Avoids stacking KAV with full-screen layouts.)
 */
function LogModalBodyHost({ children }: { children: ReactNode }) {
  if (Platform.OS === 'ios') {
    return <View style={{ flex: 1 }}>{children}</View>
  }
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      {children}
    </KeyboardAvoidingView>
  )
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
  const [logModalVisible, setLogModalVisible] = useState(false)

  const [route, setRoute] = useState<'home' | 'settings'>('home')
  const [draftSettings, setDraftSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [draftTheme, setDraftTheme] = useState<ThemePreference>('system')

  const openSettings = useCallback(() => {
    setDraftSettings({ ...settings })
    setDraftTheme(themePreference)
    // Home unmounts; the chart ScrollView resets to 0 but these refs kept old values,
    // so the "now" line and date banner desync until "Today" unless we re-run initial scroll.
    didInitialChartScrollRef.current = false
    scrollXRef.current = 0
    chartBannerIdxRef.current = -1
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

  /** Re-render ~1 Hz for the floating time label (`h:mm A`); line X is driven by rAF separately. */
  const [clockLabelTick, setClockLabelTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setClockLabelTick((n) => n + 1), 1000)
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
  const alreadySleepSafe = currentMg <= thresholdMg
  const { untilSafe, sleepSafeAt } = useMemo(() => {
    const at = dateWhenBelowThreshold(
      entries,
      settings.halfLifeHours,
      thresholdMg,
      now,
      5,
      168
    )
    if (currentMg <= thresholdMg) return { untilSafe: 0, sleepSafeAt: at }
    if (at == null) return { untilSafe: null, sleepSafeAt: null }
    return {
      untilSafe: (at.getTime() - now.getTime()) / (1000 * 60),
      sleepSafeAt: at,
    }
  }, [entries, settings.halfLifeHours, thresholdMg, now, currentMg])

  const [pastDays, setPastDays] = useState(INITIAL_PAST_DAYS)
  const [futureDays, setFutureDays] = useState(INITIAL_FUTURE_DAYS)
  const [chartViewDate, setChartViewDate] = useState(() =>
    dayjs().format('dddd, MMMM D, YYYY')
  )

  const chartScrollRef = useRef<ScrollView | null>(null)
  const scrollXRef = useRef(0)
  /** Visible-day banner: skip setState when center index unchanged during scroll. */
  const chartBannerIdxRef = useRef(-1)
  /**
   * Viewport X of the “now” line: `nowLineScrollX - scrollX`. A single `Animated.Value`
   * updated from scroll events + when the content-x changes — `Animated.subtract` against
   * scroll was not staying in sync on device (line stuck; label still ticked).
   */
  const nowLineScreenXAnim = useRef(new Animated.Value(0)).current
  const nowLineScrollXRef = useRef(0)
  const scrollPastAdjustRef = useRef(0)
  const didInitialChartScrollRef = useRef(false)
  const pendingTodayScrollRef = useRef(false)
  const lastExtendPastRef = useRef(0)
  const lastExtendFutureRef = useRef(0)

  const fullSeries = useMemo(() => {
    const start = dayjs(now).subtract(pastDays, 'day').startOf('hour').toDate()
    const end = dayjs(now).add(futureDays, 'day').endOf('hour').toDate()
    return buildSeries(entries, start, end, settings.halfLifeHours, CHART_STEP_MIN)
  }, [entries, now, settings.halfLifeHours, pastDays, futureDays])

  const windowWidth = Dimensions.get('window').width
  /** Full window width so the chart can sit edge-to-edge when margins cancel scroll padding. */
  const chartViewportW = Math.max(240, windowWidth)

  const chartPointSpacing = useMemo(
    () =>
      Math.max(
        CHART_MIN_POINT_SPACING,
        Math.round(chartViewportW / CHART_HOURS_IN_VIEWPORT)
      ),
    [chartViewportW]
  )

  const fullSeriesRef = useRef(fullSeries)
  const chartPointSpacingRef = useRef(chartPointSpacing)
  fullSeriesRef.current = fullSeries
  chartPointSpacingRef.current = chartPointSpacing

  const chartLabelsExtraHeight = useMemo(
    () =>
      Math.max(10, X_AXIS_LABEL_MIN_SLOT_WIDTH - chartPointSpacing),
    [chartPointSpacing]
  )

  /** Pixels from chart block bottom up to the plotted x-axis (approx.). */
  const chartNowLineBottomReserve = useMemo(
    () =>
      Math.max(
        22,
        CHART_X_AXIS_LABELS_H +
          CHART_X_AXIS_LABEL_SHIFT +
          chartLabelsExtraHeight -
          CHART_X_AXIS_THICKNESS -
          CHART_NOW_LINE_BOTTOM_RESERVE_TRIM
      ),
    [chartLabelsExtraHeight]
  )

  const [chartBlockHeight, setChartBlockHeight] = useState(0)

  const onChartBlockLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height
    if (h > 0) setChartBlockHeight(h)
  }, [])

  const nowLineHeight = useMemo(() => {
    if (chartBlockHeight <= 0) return 0
    return Math.max(
      1,
      chartBlockHeight - CHART_NOW_LINE_TOP - chartNowLineBottomReserve
    )
  }, [chartBlockHeight, chartNowLineBottomReserve])

  const chartLayout = useMemo(
    () => buildScrollableLineData(fullSeries, c.muted),
    [fullSeries, c.muted]
  )

  const { lineData } = chartLayout

  /**
   * Drive the “now” line at display refresh rate so it drifts smoothly within each hour.
   * (1 Hz React updates were visibly stepping the line.) Only runs on the home chart.
   */
  useEffect(() => {
    if (!hydrated || route !== 'home') return undefined
    let rafId = 0
    let active = true
    const tick = () => {
      if (!active) return
      const series = fullSeriesRef.current
      if (series.length >= 2) {
        const nx = nowLineXInScrollContentCoords(
          series,
          Date.now(),
          CHART_INITIAL_SPACING,
          chartPointSpacingRef.current
        )
        nowLineScrollXRef.current = nx
        nowLineScreenXAnim.setValue(nx - scrollXRef.current)
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      active = false
      cancelAnimationFrame(rafId)
    }
  }, [hydrated, route, nowLineScreenXAnim])

  /** Wall time for the pill; line position uses `Date.now()` every frame via rAF. */
  const nowTimeLabel = useMemo(
    () => dayjs(Date.now()).format('h:mm A'),
    [clockLabelTick]
  )

  /**
   * Match gifted-charts `totalWidth`: `initialSpacing + sum(per-point spacing) + endSpacing`
   * (each data point contributes one `spacing` in their cumulative sum).
   */
  const chartTotalWidth =
    CHART_INITIAL_SPACING +
    Math.max(0, fullSeries.length) * chartPointSpacing +
    CHART_END_SPACING

  /** Nearest series index to local midnight of the calendar day containing `now` (for default scroll). */
  const midnightTodayIndex = useMemo(() => {
    if (fullSeries.length === 0) return 0
    const midnight = dayjs(now).startOf('day').valueOf()
    let bestIdx = 0
    let bestDist = Infinity
    fullSeries.forEach((p, i) => {
      const dist = Math.abs(p.t - midnight)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    })
    return bestIdx
  }, [fullSeries, now])

  const chartMax = useMemo(() => {
    const peak = Math.max(
      thresholdMg,
      10,
      ...fullSeries.map((p) => p.caffeine_mg)
    )
    const padded = Math.ceil(peak * 1.08)
    return Math.max(
      CHART_Y_STEP_MG,
      Math.ceil(padded / CHART_Y_STEP_MG) * CHART_Y_STEP_MG
    )
  }, [fullSeries, thresholdMg])

  const updateChartViewDate = useCallback(
    (scrollX: number) => {
      if (fullSeries.length === 0) return
      const contentX = scrollX + chartViewportW / 2
      const x0 = 2 * CHART_INITIAL_SPACING
      const idx = Math.round(
        Math.max(0, (contentX - x0) / chartPointSpacing)
      )
      const clamped = Math.min(idx, fullSeries.length - 1)
      if (clamped === chartBannerIdxRef.current) return
      chartBannerIdxRef.current = clamped
      setChartViewDate(
        dayjs(fullSeries[clamped].t).format('dddd, MMMM D, YYYY')
      )
    },
    [fullSeries, chartViewportW, chartPointSpacing]
  )

  const onChartScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x
      scrollXRef.current = x
      nowLineScreenXAnim.setValue(nowLineScrollXRef.current - x)
      updateChartViewDate(x)
    },
    [nowLineScreenXAnim, updateChartViewDate]
  )

  const jumpToToday = useCallback(() => {
    pendingTodayScrollRef.current = true
    setNow(new Date())
  }, [])

  const extendPast = useCallback(() => {
    const t = Date.now()
    if (t - lastExtendPastRef.current < 900) return
    lastExtendPastRef.current = t
    scrollPastAdjustRef.current =
      EXTEND_DAYS * pointsPerDayFromStep(CHART_STEP_MIN) * chartPointSpacing
    setPastDays((d) => d + EXTEND_DAYS)
  }, [chartPointSpacing])

  const extendFuture = useCallback(() => {
    const t = Date.now()
    if (t - lastExtendFutureRef.current < 900) return
    lastExtendFutureRef.current = t
    setFutureDays((d) => d + EXTEND_DAYS)
  }, [])

  useLayoutEffect(() => {
    const dx = scrollPastAdjustRef.current
    if (dx <= 0) return
    scrollPastAdjustRef.current = 0
    const target = scrollXRef.current + dx
    const x = Math.max(0, target)
    chartScrollRef.current?.scrollTo({ x, animated: false })
    scrollXRef.current = x
    nowLineScreenXAnim.setValue(nowLineScrollXRef.current - x)
    chartBannerIdxRef.current = -1
    updateChartViewDate(x)
  }, [pastDays, updateChartViewDate, nowLineScreenXAnim])

  useLayoutEffect(() => {
    if (!pendingTodayScrollRef.current || fullSeries.length < 2) return
    pendingTodayScrollRef.current = false
    const nowMs = Date.now()
    let idx = 0
    let best = Infinity
    fullSeries.forEach((p, i) => {
      const dist = Math.abs(p.t - nowMs)
      if (dist < best) {
        best = dist
        idx = i
      }
    })
    const x = Math.max(
      0,
      2 * CHART_INITIAL_SPACING +
        idx * chartPointSpacing -
        chartViewportW / 2
    )
    chartScrollRef.current?.scrollTo({ x, animated: true })
    scrollXRef.current = x
    nowLineScreenXAnim.setValue(nowLineScrollXRef.current - x)
    chartBannerIdxRef.current = -1
    updateChartViewDate(x)
    didInitialChartScrollRef.current = true
  }, [
    fullSeries,
    chartViewportW,
    chartPointSpacing,
    updateChartViewDate,
    nowLineScreenXAnim,
  ])

  useEffect(() => {
    if (!hydrated || route !== 'home') return
    if (fullSeries.length < 2 || didInitialChartScrollRef.current) {
      return
    }
    const rawLeft =
      2 * CHART_INITIAL_SPACING + midnightTodayIndex * chartPointSpacing
    const maxScrollX = Math.max(0, chartTotalWidth - chartViewportW)
    const x = Math.max(0, Math.min(rawLeft, maxScrollX))
    const timer = setTimeout(() => {
      if (didInitialChartScrollRef.current) return
      if (!chartScrollRef.current) return
      didInitialChartScrollRef.current = true
      chartScrollRef.current.scrollTo({ x, animated: false })
      scrollXRef.current = x
      nowLineScreenXAnim.setValue(nowLineScrollXRef.current - x)
      chartBannerIdxRef.current = -1
      updateChartViewDate(x)
    }, 200)
    return () => clearTimeout(timer)
  }, [
    hydrated,
    route,
    fullSeries.length,
    midnightTodayIndex,
    chartTotalWidth,
    chartViewportW,
    chartPointSpacing,
    updateChartViewDate,
    nowLineScreenXAnim,
  ])

  useEffect(() => {
    if (!didInitialChartScrollRef.current || fullSeries.length === 0) return
    chartBannerIdxRef.current = -1
    const nx = nowLineXInScrollContentCoords(
      fullSeries,
      Date.now(),
      CHART_INITIAL_SPACING,
      chartPointSpacing
    )
    nowLineScrollXRef.current = nx
    nowLineScreenXAnim.setValue(nx - scrollXRef.current)
    updateChartViewDate(scrollXRef.current)
  }, [fullSeries, chartPointSpacing, updateChartViewDate, nowLineScreenXAnim])

  const closeLogModal = useCallback(() => {
    setLogModalVisible(false)
    setShowPicker(false)
  }, [])

  useEffect(() => {
    if (!logModalVisible) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeLogModal()
      return true
    })
    return () => sub.remove()
  }, [logModalVisible, closeLogModal])

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
    closeLogModal()
  }, [formMg, consumptionAt, formLabel, closeLogModal])

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

  const consumptionDayGroups = useMemo(
    () => groupEntriesByConsumptionDay(sortedEntries),
    [sortedEntries]
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
            nestedScrollEnabled
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

  /** Space for absolute bottom nav (inside safe area; SafeAreaView already pads home indicator). */
  const bottomNavClearance = 86

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.homeRoot}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.homeHeaderStrip}>
            <View style={styles.headerRow}>
              <View
                style={[
                  styles.headerLogoChip,
                  {
                    backgroundColor:
                      scheme === 'dark'
                        ? PREFIX_LOGO_CHIP_BG_DARK
                        : 'transparent',
                  },
                ]}
              >
                <Image
                  source={
                    scheme === 'dark'
                      ? PREFIX_LOGO_DARK_THEME
                      : PREFIX_LOGO_LIGHT_THEME
                  }
                  style={styles.headerLogoImage}
                  resizeMode="contain"
                  accessibilityLabel="Prefix"
                />
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.title}>Caffeine Curve</Text>
                {/* <Text style={styles.tagline}>
                Decay curve vs a simple sleep-safe line (1.5 mg/kg). Awareness
                only—not medical advice.
              </Text> */}
              </View>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={[
              styles.homeScrollContent,
              { paddingBottom: 24 + bottomNavClearance },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
          >
          <View style={styles.activeCaffeineSection}>
            <Text style={styles.cardTitle}>Summary</Text>
            <View style={styles.statsRowTop}>
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>Current</Text>
                <View style={styles.statValueRow}>
                  <Text style={[styles.statValue, styles.statValueSmall]}>{currentMg.toFixed(0)} mg</Text>
                </View>
              </View>
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>Until Sleep-Safe</Text>
                <View style={styles.statValueRow}>
                  <Text style={[styles.statValue, styles.statValueSmall]}>
                    {formatDurationMinutes(untilSafe)}
                  </Text>
                </View>
              </View>
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>Sleep-Safe At</Text>
                <View style={styles.statValueRow}>
                  <Text style={[styles.statValue, styles.statValueSmall]}>
                    {formatSleepSafeAt(sleepSafeAt, alreadySleepSafe)}
                  </Text>
                </View>
              </View>
            </View>
            {/* <Text style={styles.chartCaption}>
              About {CHART_HOURS_IN_VIEWPORT} hours of the timeline show at once;
              drag sideways for weeks of history or future. Dashed line ≈
              sleep-safe ({thresholdMg.toFixed(0)} mg). Near the ends, more days
              load. Opens from midnight today; Today jumps to now.
            </Text> */}
            <View style={styles.chartBannerRow}>
              <Text
                style={[styles.chartDateBanner, { color: c.textStrong }]}
                numberOfLines={1}
              >
                {chartViewDate}
              </Text>
              <Pressable
                onPress={jumpToToday}
                style={({ pressed }) => [
                  styles.chartTodayBtn,
                  {
                    borderColor: c.border,
                    backgroundColor: c.surface,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Ionicons name="today-outline" size={18} color={c.accent} />
                <Text style={[styles.chartTodayBtnText, { color: c.accent }]}>
                  Today
                </Text>
              </Pressable>
            </View>
            <View
              style={[
                styles.chartRow,
                styles.chartRowFullBleed,
                {
                  width: windowWidth,
                  marginLeft: -(16 + insets.left),
                  marginRight: -(16 + insets.right),
                },
              ]}
            >
              <View
                style={{ position: 'relative', width: chartViewportW }}
                collapsable={false}
              >
                <View onLayout={onChartBlockLayout}>
                  <LineChart
                    scrollRef={chartScrollRef}
                    parentWidth={chartViewportW}
                    height={CHART_HEIGHT}
                    spacing={chartPointSpacing}
                    initialSpacing={CHART_INITIAL_SPACING}
                    endSpacing={CHART_END_SPACING}
                    data={lineData}
                    color={c.chart}
                    thickness={2}
                    hideDataPoints
                    overflowBottom={0}
                    yAxisColor="transparent"
                    yAxisThickness={0}
                    xAxisColor={c.border}
                    xAxisThickness={CHART_X_AXIS_THICKNESS}
                    xAxisType="solid"
                    rulesColor={c.border}
                    floatingYAxisLabels
                    hideYAxisText
                    yAxisTextStyle={{
                      color: c.muted,
                      fontSize: 10,
                    }}
                    yAxisLabelContainerStyle={{
                      width: CHART_FLOATING_Y_LABEL_W,
                      paddingLeft: 6,
                      paddingTop: CHART_FLOATING_Y_LABEL_NUDGE_Y,
                    }}
                    xAxisLabelTextStyle={{
                      color: c.muted,
                      fontSize: 10,
                    }}
                    xAxisTextNumberOfLines={1}
                    xAxisLabelsHeight={CHART_X_AXIS_LABELS_H}
                    xAxisLabelsVerticalShift={CHART_X_AXIS_LABEL_SHIFT}
                    labelsExtraHeight={chartLabelsExtraHeight}
                    maxValue={chartMax}
                    mostNegativeValue={0}
                    stepValue={CHART_Y_STEP_MG}
                    yAxisLabelWidth={0}
                    hideOrigin
                    showFractionalValues={false}
                    roundToDigits={0}
                    formatYLabel={(lbl) => {
                      const n = Number(lbl)
                      if (!Number.isFinite(n)) return String(lbl)
                      return `${Math.round(n)} mg`
                    }}
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
                    showScrollIndicator
                    scrollEventThrottle={16}
                    onScroll={onChartScroll}
                    onStartReached={extendPast}
                    onEndReached={extendFuture}
                    endReachedOffset={120}
                  />
                </View>
                {fullSeries.length >= 2 && nowLineHeight > 0 && (
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: chartViewportW,
                      height: chartBlockHeight,
                      transform: [{ translateX: nowLineScreenXAnim }],
                    }}
                  >
                    <View
                      style={{
                        position: 'absolute',
                        left: 0,
                        marginLeft: -0.5,
                        top: CHART_NOW_LINE_TOP,
                        height: nowLineHeight,
                        width: 1,
                        backgroundColor: c.accent,
                      }}
                    />
                    <View
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: CHART_NOW_TIME_TOP,
                        transform: [{ translateX: -36 }],
                      }}
                    >
                      <ChartNowTimeOverlayLabel
                        label={nowTimeLabel}
                        color={c.accent}
                      />
                    </View>
                  </Animated.View>
                )}
              </View>
            </View>
          </View>

          {consumptionDayGroups.length > 0 && (
            <View style={styles.consumptionSection}>
              <Text style={styles.cardTitle}>Caffeine Consumption</Text>
              {consumptionDayGroups.map((group, gi) => (
                <View
                  key={group.dayKey}
                  style={gi > 0 ? styles.consumptionDayBlock : undefined}
                >
                  <Text
                    style={[styles.consumptionDayHeading, { color: c.muted }]}
                  >
                    {group.label}
                  </Text>
                  {group.entries.map((e, ei) => {
                    const isLastInGroup = ei === group.entries.length - 1
                    return (
                      <View
                        key={e.id}
                        style={[
                          styles.entryRow,
                          isLastInGroup && styles.entryRowGroupLast,
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.entryTitle}>
                            {e.caffeine_mg} mg · {e.label}
                          </Text>
                          <Text style={styles.entryMeta}>
                            {dayjs(e.timestamp).format('lll')}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => removeEntry(e.id)}
                          hitSlop={8}
                        >
                          <Text style={styles.removeText}>Remove</Text>
                        </Pressable>
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>
          )}

          <Text style={styles.disclaimer}>
            Fixed half-life and a rough mg/kg cutoff for education only. Not
            medical advice.
          </Text>
        </ScrollView>
        </KeyboardAvoidingView>

        <View
          style={[
            styles.homeBottomNav,
            {
              backgroundColor: c.bg,
              borderTopColor: c.border,
            },
          ]}
        >
          <View style={styles.homeBottomNavSide} />
          <Pressable
            onPress={() => setLogModalVisible(true)}
            style={({ pressed }) => [
              styles.logFab,
              { backgroundColor: c.accent, opacity: pressed ? 0.9 : 1 },
            ]}
            accessibilityLabel="Log caffeine"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={30} color="#fff" />
          </Pressable>
          <View style={[styles.homeBottomNavSide, styles.homeBottomNavSideEnd]}>
            <Pressable
              onPress={openSettings}
              accessibilityLabel="Open settings"
              style={({ pressed }) => [
                styles.homeBottomNavIconBtn,
                { opacity: pressed ? 0.65 : 1 },
              ]}
              hitSlop={10}
            >
              <Ionicons
                name="settings-outline"
                size={22}
                color={c.textStrong}
              />
            </Pressable>
          </View>
        </View>
      </View>

      {logModalVisible ? (
        <>
          <View
            style={[styles.logModalBackdrop, { backgroundColor: c.bg }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <View
            style={[
              styles.logModalOverlayRoot,
              {
                backgroundColor: c.bg,
                top: insets.top,
                left: insets.left,
                right: insets.right,
                bottom: insets.bottom,
              },
            ]}
            accessibilityViewIsModal={Platform.OS === 'ios'}
            importantForAccessibility="yes"
          >
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <View
            style={[
              styles.logModalHeaderBar,
              {
                paddingTop: 10,
                paddingHorizontal: 16,
                paddingBottom: 10,
                borderBottomColor: c.border,
              },
            ]}
          >
            <Text style={[styles.logModalTitle, { color: c.textStrong }]}>
              Log caffeine
            </Text>
            <Pressable
              onPress={closeLogModal}
              hitSlop={16}
              style={styles.logModalCloseBtn}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={26} color={c.muted} />
            </Pressable>
          </View>
          <LogModalBodyHost>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
              keyboardDismissMode={
                Platform.OS === 'ios' ? 'interactive' : 'on-drag'
              }
              bounces={Platform.OS !== 'ios'}
              alwaysBounceVertical={false}
              contentContainerStyle={[
                styles.logModalScrollContent,
                {
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: 24,
                },
              ]}
            >
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
            </ScrollView>
          </LogModalBodyHost>
          </View>
        </>
      ) : null}
    </SafeAreaView>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    safe: { flex: 1 },
    homeRoot: { flex: 1 },
    homeBottomNav: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 10,
      paddingBottom: 2,
      paddingHorizontal: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    /** Same width on left/right so the + stays visually centered. */
    homeBottomNavSide: {
      width: 46,
      minHeight: 40,
      justifyContent: 'center',
    },
    homeBottomNavSideEnd: {
      alignItems: 'flex-end',
    },
    homeBottomNavIconBtn: {
      padding: 6,
      borderRadius: 10,
    },
    logFab: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
    logModalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 199,
      elevation: 199,
    },
    logModalOverlayRoot: {
      position: 'absolute',
      zIndex: 200,
      elevation: 200,
    },
    logModalHeaderBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: StyleSheet.hairlineWidth,
      zIndex: 2,
      elevation: 4,
    },
    logModalCloseBtn: {
      padding: 8,
      marginRight: -4,
    },
    logModalScrollContent: {
      flexGrow: 1,
    },
    logModalTitle: {
      fontSize: 18,
      fontWeight: '700',
    },
    scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
    /** Same horizontal inset as section titles (`cardTitle`); header sits outside ScrollView here. */
    homeHeaderStrip: {
      paddingHorizontal: 16,
      paddingTop: 8,
      marginBottom: 16,
    },
    homeScrollContent: {
      paddingHorizontal: 16,
      paddingTop: 0,
    },
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
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerLogoChip: {
      width: 52,
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      /** Optical align with section titles (asset + chip centering add rightward slack). */
      marginLeft: -5,
    },
    headerLogoImage: {
      width: 40,
      height: 40,
      /** Shift raster slightly left inside the chip toward the visible glyph. */
      marginLeft: -2,
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
    chartBannerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    chartDateBanner: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 20,
    },
    chartTodayBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
    },
    chartTodayBtnText: { fontSize: 14, fontWeight: '600' },
    chartRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      marginVertical: 4,
    },
    /** Horizontal bleed is applied per-screen with safe-area insets (see chart row `style`). */
    chartRowFullBleed: {
      alignSelf: 'stretch',
    },
    activeCaffeineSection: {
      marginBottom: 14,
    },
    consumptionSection: {
      marginBottom: 14,
    },
    consumptionDayBlock: {
      marginTop: 16,
    },
    consumptionDayHeading: {
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 8,
    },
    entryRowGroupLast: {
      borderBottomWidth: 0,
    },
    statsRowTop: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 22,
    },
    statCol: { flex: 1 },
    statLabel: { fontSize: 12, color: c.muted, marginBottom: 2 },
    statValueRow: {
      justifyContent: 'flex-start',
    },
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
