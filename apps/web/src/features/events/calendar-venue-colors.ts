const venueCardTones = {
  villaElisa: 'border-teal-300 bg-teal-200 text-teal-950 hover:bg-teal-300',
  laPlata: 'border-red-400 bg-red-300 text-red-950 hover:bg-red-400',
  sanCarlos: 'border-slate-400 bg-slate-300 text-slate-950 hover:bg-slate-400',
  catering: 'border-sky-300 bg-sky-200 text-sky-950 hover:bg-sky-300'
} as const;

export const venueColorLegend = [
  { label: 'Villa Elisa', swatch: 'bg-teal-200' },
  { label: 'La Plata', swatch: 'bg-red-300' },
  { label: 'San Carlos', swatch: 'bg-slate-300' },
  { label: 'Catering externo', swatch: 'bg-sky-200' }
] as const;

export function calendarVenueCardTone(salonName: string, catering = false) {
  if (catering) return venueCardTones.catering;

  const name = salonName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (name.includes('villa elisa')) return venueCardTones.villaElisa;
  if (name.includes('san carlos')) return venueCardTones.sanCarlos;
  if (name.includes('la plata')) return venueCardTones.laPlata;
  return null;
}
