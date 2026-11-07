let calendarCache: {
  items: unknown[];
  timestamp: number;
} | null = null;

export function getCalendarCache<T>() {
  return calendarCache as {
    items: T[];
    timestamp: number;
  } | null;
}

export function setCalendarCache<T>(items: T[]) {
  calendarCache = {
    items,
    timestamp: Date.now(),
  };
}

export function invalidateCalendarCache() {
  calendarCache = null;
}
