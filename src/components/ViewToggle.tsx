'use client'

export type OverviewView = 'week' | 'month' | 'interval'

/** Vecka / Månad / Intervall switch, rendered inside each view's top row. */
export function ViewToggle({ value, onChange }: { value: OverviewView; onChange: (v: OverviewView) => void }) {
  return (
    <div className="view-toggle">
      <button className={value === 'week' ? 'active' : ''} onClick={() => onChange('week')}>Vecka</button>
      <button className={value === 'month' ? 'active' : ''} onClick={() => onChange('month')}>Månad</button>
      <button className={value === 'interval' ? 'active' : ''} onClick={() => onChange('interval')}>Intervall</button>
    </div>
  )
}
