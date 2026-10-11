type MediaCardLayout = {
  columns: number;
  gap: number;
  containerPadding: number;
  cardWidth: number;
  cardMarginRight: number;
  listPosterHeight: number;
  listPosterWidth: number;
  listCardWidth: number;
};

export function getMediaCardLayout(
  screenWidth: number,
  horizontal = false,
  list = false,
): MediaCardLayout {
  const SIDE_MARGIN = 20;
  const MIN_GAP = 15;
  const POSTER_WIDTH = 110;
  const MOBILE_BREAKPOINT = 430;
  const MOBILE_POSTER_WIDTH = 96;

  if (list) {
    const containerWidth = screenWidth - SIDE_MARGIN * 2;

    return {
      columns: 1,
      gap: 0,
      containerPadding: SIDE_MARGIN,
      cardWidth: screenWidth,
      cardMarginRight: 0,
      listPosterWidth: containerWidth / 4,
      listPosterHeight: containerWidth * 0.4,
      listCardWidth: containerWidth,
    };
  }

  if (horizontal) {
    return {
      columns: 1,
      gap: MIN_GAP,
      containerPadding: SIDE_MARGIN,
      cardWidth: POSTER_WIDTH,
      cardMarginRight: MIN_GAP,
      listPosterWidth: 0,
      listPosterHeight: 0,
      listCardWidth: 0,
    };
  }

  const posterWidth =
    screenWidth < MOBILE_BREAKPOINT
      ? MOBILE_POSTER_WIDTH
      : POSTER_WIDTH;

  const availableWidth = screenWidth - SIDE_MARGIN * 2;
  const columns = Math.max(
    2,
    Math.floor((availableWidth + MIN_GAP) / (posterWidth + MIN_GAP)),
  );

  const gap =
    columns > 1
      ? (availableWidth - posterWidth * columns) / (columns - 1)
      : 0;

  return {
    columns,
    gap,
    containerPadding: SIDE_MARGIN,
    cardWidth: posterWidth,
    cardMarginRight: 0,
    listPosterWidth: 0,
    listPosterHeight: 0,
    listCardWidth: 0,
  };
}

export type { MediaCardLayout };

