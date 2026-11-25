type CalendarMediaType = "series" | "movie";

type DirtyCalendarMedia = {
  type: CalendarMediaType;
  tmdb_id: number;
};

let calendarCache: {
  items: unknown[];
  timestamp: number;
} | null = null;

let dirtyCalendarMedia: DirtyCalendarMedia[] = [];

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

export function updateCalendarCache<T>(items: T[]) {
  if (!calendarCache) {
    setCalendarCache(items);
    return;
  }

  calendarCache = {
    ...calendarCache,
    items,
  };
}

export function markCalendarMediaDirty(
  type: CalendarMediaType,
  tmdb_id: number,
): void {
  const alreadyMarked = dirtyCalendarMedia.some(
    (item) => item.type === type && item.tmdb_id === tmdb_id,
  );

  if (!alreadyMarked) {
    dirtyCalendarMedia.push({ type, tmdb_id });
  }
}

export function getDirtyCalendarMedia(): DirtyCalendarMedia[] {
  return [...dirtyCalendarMedia];
}

export function clearDirtyCalendarMedia(processed: DirtyCalendarMedia[]): void {
  dirtyCalendarMedia = dirtyCalendarMedia.filter(
    (item) =>
      !processed.some(
        (processedItem) =>
          processedItem.type === item.type &&
          processedItem.tmdb_id === item.tmdb_id,
      ),
  );
}
