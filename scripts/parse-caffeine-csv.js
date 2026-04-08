/**
 * Regenerates src/caffeineDatabase.json from assets/caffeine_database.csv
 * Run: node scripts/parse-caffeine-csv.js
 */
const fs = require('fs')
const path = require('path')

function parseLine(line) {
  const parts = []
  let cur = ''
  let inQ = false
  for (let j = 0; j < line.length; j++) {
    const ch = line[j]
    if (ch === '"') {
      inQ = !inQ
      continue
    }
    if (ch === ',' && !inQ) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  parts.push(cur)
  return parts
}

const root = path.join(__dirname, '..')
const csvPath = path.join(root, 'assets', 'caffeine_database.csv')
const outPath = path.join(root, 'src', 'caffeineDatabase.json')

const csv = fs.readFileSync(csvPath, 'utf8')
const lines = csv.trim().split(/\r?\n/)
const rows = []
for (let i = 1; i < lines.length; i++) {
  const line = lines[i]
  if (!line.trim()) continue
  const parts = parseLine(line)
  if (parts.length < 5) continue
  const name = parts[0]
  const oz = parseFloat(parts[1])
  const mg = parseFloat(parts[2])
  const image_url = parts[3]
  const category = parts[4]
  if (!name || Number.isNaN(mg)) continue
  rows.push({ name, oz, mg, image_url, category })
}

fs.writeFileSync(outPath, JSON.stringify(rows))
console.log(`Wrote ${rows.length} rows to src/caffeineDatabase.json`)
