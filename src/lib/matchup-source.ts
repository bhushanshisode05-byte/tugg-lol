/** Matchups the house adds (daily AI generator or the owner) rather than a paying player. */
export const addedByTugg = (source: string | null | undefined) => source === "ai" || source === "owner";
