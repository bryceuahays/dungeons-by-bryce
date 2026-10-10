// The genres a campaign can be tagged with (settings.genres). Change the list here.
export const GENRES = ['Fantasy', 'Dark fantasy', 'Horror', 'Mystery', 'Science fiction', 'Post-apocalyptic', 'Historical', 'Comedy', 'Intrigue', 'Exploration'] as const;
export const cleanGenres = (list: unknown[]): string[] => GENRES.filter((g) => list.map(String).includes(g));
