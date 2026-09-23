import { Card } from '@/components/ui';
import type { DashboardDTO } from '@/lib/contracts';
import { handledTotal, kpiTiles, progressPercent, type KpiTile } from './logic';
import { Meter } from './Meter';

const TONE: Record<KpiTile['tone'], string> = {
  neutral: 'text-ink',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
};

/** The one number the dashboard leads with. Exactly one of these per view. */
export function HeroProgress({ kpis }: { kpis: DashboardDTO['kpis'] }) {
  const handled = handledTotal(kpis);
  const pct = progressPercent(handled, kpis.totalMapped);
  return (
    <Card>
      <p className="text-sm text-ink-muted">מהציוד שמופה כבר נכנס לתהליך</p>
      {/* Proportional figures on purpose: tabular-nums looks loose at display sizes. */}
      <p className="mt-1 text-6xl font-semibold leading-none">{pct}%</p>
      <p className="mt-2 mb-3 text-sm text-ink-muted">
        {handled} מתוך {kpis.totalMapped} פריטים
      </p>
      <Meter value={handled} max={kpis.totalMapped} label="התקדמות כוללת" />
    </Card>
  );
}

export function KpiTiles({ kpis }: { kpis: DashboardDTO['kpis'] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {kpiTiles(kpis).map((tile) => (
        <Card key={tile.key}>
          <p className="text-sm text-ink-muted">{tile.label}</p>
          <p className={`mt-1 text-3xl font-semibold ${TONE[tile.tone]}`}>
            {tile.value}
            {tile.glyph && (
              <span aria-hidden className="ms-2 text-xl">
                {tile.glyph}
              </span>
            )}
          </p>
        </Card>
      ))}
    </div>
  );
}
