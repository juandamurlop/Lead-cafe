const LOCALE = 'es-CO';

export function num(v: number, dec = 1): string {
  return v.toLocaleString(LOCALE, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function entero(v: number): string {
  return Math.round(v).toLocaleString(LOCALE);
}

export function cop(v: number): string {
  const s = Math.abs(Math.round(v)).toLocaleString(LOCALE);
  return `${v < 0 ? '−' : ''}$${s}`;
}

export function copCorto(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${v < 0 ? '−' : ''}$${num(a / 1_000_000, a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${v < 0 ? '−' : ''}$${entero(a / 1_000)}k`;
  return cop(v);
}

export function pct(v: number, dec = 1): string {
  return `${num(v * 100, dec)} %`;
}

export function mmss(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function horas(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.round((segundos % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
