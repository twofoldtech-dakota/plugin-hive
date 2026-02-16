// Cron parser for 5-field expressions: minute hour dom month dow
// Supports: numbers, ranges (1-5), lists (1,3,5), steps (star/15), wildcards (*)

export interface CronParts {
  minutes: number[];
  hours: number[];
  doms: number[];
  months: number[];
  dows: number[];
}

function parseField(field: string, min: number, max: number): number[] | null {
  const values = new Set<number>();
  const parts = field.split(",");

  for (const part of parts) {
    // Handle step (*/N or range/N)
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10);
      if (isNaN(step) || step < 1) return null;
      const base = stepMatch[1] === "*" ? `${min}-${max}` : stepMatch[1];
      const rangeMatch = base.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        if (start < min || end > max || start > end) return null;
        for (let i = start; i <= end; i += step) values.add(i);
      } else {
        // single number with step doesn't make sense, but handle */N
        for (let i = min; i <= max; i += step) values.add(i);
      }
      continue;
    }

    // Handle wildcard
    if (part === "*") {
      for (let i = min; i <= max; i++) values.add(i);
      continue;
    }

    // Handle range
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start < min || end > max || start > end) return null;
      for (let i = start; i <= end; i++) values.add(i);
      continue;
    }

    // Handle single number
    const num = parseInt(part, 10);
    if (isNaN(num) || num < min || num > max) return null;
    values.add(num);
  }

  return values.size > 0 ? [...values].sort((a, b) => a - b) : null;
}

export function parseCron(expression: string): CronParts | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const minutes = parseField(fields[0], 0, 59);
  const hours = parseField(fields[1], 0, 23);
  const doms = parseField(fields[2], 1, 31);
  const months = parseField(fields[3], 1, 12);
  const dows = parseField(fields[4], 0, 6);

  if (!minutes || !hours || !doms || !months || !dows) return null;

  return { minutes, hours, doms, months, dows };
}

export function cronMatches(expression: string, date: Date): boolean {
  const parts = parseCron(expression);
  if (!parts) return false;

  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dom = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const dow = date.getUTCDay();

  return (
    parts.minutes.includes(minute) &&
    parts.hours.includes(hour) &&
    parts.doms.includes(dom) &&
    parts.months.includes(month) &&
    parts.dows.includes(dow)
  );
}

export function nextCronRun(expression: string, after: Date): Date {
  const parts = parseCron(expression);
  if (!parts) throw new Error(`Invalid cron expression: ${expression}`);

  // Start from the next minute
  const candidate = new Date(after.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  // Search up to 1 year ahead
  const maxIterations = 525960; // ~365.25 days * 24 * 60
  for (let i = 0; i < maxIterations; i++) {
    if (cronMatches(expression, candidate)) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  // Fallback: 1 hour from now
  return new Date(after.getTime() + 3600000);
}
