// Parses an ISO 8601 duration ("PT1H30M") into whole minutes, as used by schema.org
// Recipe.prepTime/cookTime. Returns null for anything unparseable.
export function parseIso8601DurationToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return null;

  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);

  const totalMinutes = days * 24 * 60 + hours * 60 + minutes + seconds / 60;
  if (totalMinutes === 0 && !match[1] && !match[2] && !match[3] && !match[4]) return null;
  return Math.round(totalMinutes);
}
