import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'
import {
  buildSeries,
  minutesUntilBelowThreshold,
  sleepThresholdMg,
  totalCaffeineAt,
  weightToKg,
} from './caffeineMath'
import { loadState, saveState } from './storage'
import type { AppSettings, CaffeineEntry, WeightUnit } from './types'
import { DEFAULT_SETTINGS } from './types'

const PRESETS: { label: string; mg: number }[] = [
  { label: 'Coffee (~95 mg)', mg: 95 },
  { label: 'Energy drink (~160 mg)', mg: 160 },
  { label: 'Pre-workout (~200 mg)', mg: 200 },
]

function formatDurationMinutes(mins: number | null): string {
  if (mins === null) return 'Not within a week (check entries)'
  if (mins === 0) return 'Already in sleep-safe range'
  if (mins < 60) return `~${Math.round(mins)} min`
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`
}

function getThemePreference(): 'light' | 'dark' {
  const stored = localStorage.getItem('caffeine-tracker-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export default function App() {
  const [entries, setEntries] = useState<CaffeineEntry[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [hydrated, setHydrated] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof window !== 'undefined' ? getThemePreference() : 'light'
  )

  const [formMg, setFormMg] = useState('95')
  const [formTime, setFormTime] = useState(() =>
    dayjs().format('YYYY-MM-DDTHH:mm')
  )
  const [formLabel, setFormLabel] = useState('')

  useEffect(() => {
    const s = loadState()
    setEntries(s.entries)
    setSettings(s.settings)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveState({ entries, settings })
  }, [entries, settings, hydrated])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('caffeine-tracker-theme', theme)
  }, [theme])

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

  const chartData = useMemo(() => {
    const start = dayjs(now).subtract(24, 'hour').toDate()
    const end = dayjs(now).add(12, 'hour').toDate()
    return buildSeries(entries, start, end, settings.halfLifeHours, 5).map(
      (p) => ({
        t: p.t,
        caffeine_mg: Math.round(p.caffeine_mg * 10) / 10,
      })
    )
  }, [entries, now, settings.halfLifeHours, thresholdMg])

  const addEntry = useCallback(() => {
    const mg = Number(formMg)
    if (!Number.isFinite(mg) || mg <= 0) return
    const ts = dayjs(formTime)
    if (!ts.isValid()) return
    const entry: CaffeineEntry = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: ts.toISOString(),
      caffeine_mg: mg,
      label: formLabel.trim() || 'Caffeine',
    }
    setEntries((prev) => [...prev, entry])
    setFormLabel('')
  }, [formMg, formTime, formLabel])

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

  if (!hydrated) {
    return (
      <div className="card">
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <>
      <header className="app-header">
        <div>
          <h1>Caffeine half-life</h1>
          <p className="tagline">
            Track doses, see exponential decay, and compare to a simple
            sleep-safe threshold (1.5 mg/kg). For awareness—not medical advice.
          </p>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={() =>
            setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
          }
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </header>

      <section className="card" aria-labelledby="settings-heading">
        <h2 id="settings-heading">Body &amp; metabolism</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="weight">Body weight</label>
            <input
              id="weight"
              type="number"
              min={1}
              step={0.1}
              value={settings.weightValue}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  weightValue: Number(e.target.value) || 0,
                }))
              }
            />
            <div className="unit-toggle" role="group" aria-label="Weight unit">
              <button
                type="button"
                className={settings.weightUnit === 'kg' ? 'active' : ''}
                onClick={() =>
                  setSettings((s) => ({ ...s, weightUnit: 'kg' as WeightUnit }))
                }
              >
                kg
              </button>
              <button
                type="button"
                className={settings.weightUnit === 'lb' ? 'active' : ''}
                onClick={() =>
                  setSettings((s) => ({ ...s, weightUnit: 'lb' as WeightUnit }))
                }
              >
                lb
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="halflife">Caffeine half-life (hours)</label>
            <input
              id="halflife"
              type="number"
              min={0.5}
              step={0.5}
              value={settings.halfLifeHours}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  halfLifeHours: Math.max(0.5, Number(e.target.value) || 5),
                }))
              }
            />
            <p className="entry-meta" style={{ marginTop: '0.35rem' }}>
              Typical average ~5 h; adjust if you know yours.
            </p>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="log-heading">
        <h2 id="log-heading">Log caffeine</h2>
        <div className="row-actions">
          <div className="field">
            <label htmlFor="mg">Amount (mg)</label>
            <input
              id="mg"
              type="number"
              min={1}
              step={1}
              value={formMg}
              onChange={(e) => setFormMg(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="when">Time</label>
            <input
              id="when"
              type="datetime-local"
              value={formTime}
              onChange={(e) => setFormTime(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: '2 1 180px' }}>
            <label htmlFor="label">Label (optional)</label>
            <input
              id="label"
              type="text"
              placeholder="e.g. coffee, pre-workout"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
            />
          </div>
          <button type="button" className="btn-primary" onClick={addEntry}>
            Add entry
          </button>
        </div>
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setFormMg(String(p.mg))}
            >
              {p.label}
            </button>
          ))}
        </div>
        {sortedEntries.length > 0 && (
          <>
            <h3 style={{ fontSize: '0.9rem', marginTop: '1rem' }}>
              Recent entries
            </h3>
            <ul className="entries-list">
              {sortedEntries.map((e) => (
                <li key={e.id}>
                  <div>
                    <strong style={{ color: 'var(--text-strong)' }}>
                      {e.caffeine_mg} mg
                    </strong>{' '}
                    · {e.label}
                    <div className="entry-meta">
                      {dayjs(e.timestamp).format('MMM D, YYYY h:mm A')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => removeEntry(e.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="chart-heading">
        <h2 id="chart-heading">Active caffeine</h2>
        <p className="entry-meta" style={{ marginBottom: '0.5rem' }}>
          Past 24 hours through next 12 hours (5-minute steps). Dashed line =
          sleep-safe threshold ({thresholdMg.toFixed(0)} mg for your weight).
        </p>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(ts) => dayjs(ts).format('MMM D HH:mm')}
                minTickGap={28}
                stroke="var(--text)"
                tick={{ fill: 'var(--text)', fontSize: 11 }}
              />
              <YAxis
                stroke="var(--text)"
                tick={{ fill: 'var(--text)', fontSize: 11 }}
                width={44}
                label={{
                  value: 'mg',
                  angle: -90,
                  position: 'insideLeft',
                  fill: 'var(--text)',
                  fontSize: 11,
                }}
              />
              <Tooltip
                labelFormatter={(ts) => dayjs(ts as number).format('lll')}
                formatter={(value, name) => {
                  const n = typeof value === 'number' ? value : Number(value)
                  const label =
                    name === 'caffeine_mg' ? 'In system' : String(name)
                  return [`${Number.isFinite(n) ? n : '—'} mg`, label]
                }}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              />
              <Legend />
              <ReferenceLine
                y={thresholdMg}
                stroke="var(--threshold)"
                strokeDasharray="6 4"
                label={{
                  value: 'Sleep-safe',
                  fill: 'var(--threshold)',
                  fontSize: 11,
                }}
              />
              <ReferenceLine
                x={now.getTime()}
                stroke="var(--text)"
                strokeDasharray="3 3"
                label={{ value: 'Now', fill: 'var(--text)', fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="caffeine_mg"
                name="In system"
                stroke="var(--chart-line)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="stats">
          <div>
            <div className="stat-label">Current level</div>
            <div className="stat-value">{currentMg.toFixed(0)} mg</div>
          </div>
          <div>
            <div className="stat-label">Until sleep-safe zone</div>
            <div className="stat-value" style={{ fontSize: '1.25rem' }}>
              {formatDurationMinutes(untilSafe)}
            </div>
          </div>
        </div>
      </section>

      <p className="disclaimer">
        This tool uses a fixed half-life and a rough mg/kg threshold for
        education only. Caffeine metabolism varies; it is not medical advice.
        When in doubt, talk to a clinician.
      </p>
    </>
  )
}
