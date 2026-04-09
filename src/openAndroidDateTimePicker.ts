import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { Platform } from 'react-native'

function mergeDatePart(base: Date, picked: Date): Date {
  const d = new Date(base)
  d.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
  return d
}

function mergeTimePart(base: Date, picked: Date): Date {
  const d = new Date(base)
  d.setHours(picked.getHours(), picked.getMinutes(), 0, 0)
  return d
}

/**
 * Android has no combined native datetime dialog (`mode="datetime"` is iOS-only).
 * Using `datetime` on Android maps to date-only and crashes on unmount
 * (`pickers.datetime` is undefined for dismiss).
 * This opens the date dialog, then the time dialog, matching iOS behavior in spirit.
 */
export function openAndroidDateTimePicker(
  value: Date,
  onChange: (next: Date) => void,
): void {
  if (Platform.OS !== 'android') return

  DateTimePickerAndroid.open({
    value,
    mode: 'date',
    display: 'spinner',
    onChange: (event, date) => {
      if (event.type !== 'set' || !date) return
      const withDate = mergeDatePart(value, date)

      DateTimePickerAndroid.open({
        value: withDate,
        mode: 'time',
        display: 'spinner',
        onChange: (event2, time) => {
          if (event2.type === 'set' && time) {
            onChange(mergeTimePart(withDate, time))
          } else if (event2.type === 'dismissed') {
            onChange(withDate)
          }
        },
      })
    },
  })
}
