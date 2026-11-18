// One matchup content policy for the AI generator and the moderation classifier, so the generator never
// suggests less (or more) than moderation allows. Exclusions are kept word for word.

/** What a matchup may be about. */
export const ALLOWED_SUBJECTS =
  "brands, products, places, cities, countries, sports teams and famous athletes, foods, ideas, hobbies, entertainment franchises and well-known public entertainers";

/** What a matchup may never be about. */
export const NOT_ALLOWED_SUBJECTS =
  "private individuals, political parties, politicians or candidates, hate, harassment, slurs, sexual content, illegal content, drugs, scams, doxxing, gambling promotion, links/URLs";

/** Real named people are only ever compared on preference or merit. */
export const REAL_PERSON_RULE =
  "A matchup involving a real, named person must be about preference or merit only: who is better, who you would pick. It must never be framed around an accusation, alleged wrongdoing, a legal matter, a death, an illness or a personal controversy. Reject any matchup framed that way, even when the person is otherwise allowed.";

/** Instructions for the daily AI matchup generator. */
export const GENERATOR_INSTRUCTIONS =
  "Suggest 8 popular, well-known, friendly two-sided rivalries for Tugg, a playful pay-to-pull rope game. Spread them across Tech, Sports, Entertainment, Food and Cities. " +
  `Only these subjects: ${ALLOWED_SUBJECTS}. ` +
  "No politics, no private people, nothing offensive. " +
  `Never suggest: ${NOT_ALLOWED_SUBJECTS}. ` +
  `${REAL_PERSON_RULE} ` +
  "Side names under 30 characters. Description: one short neutral sentence under 120 characters. Never repeat a pair from the existing list in either order.";

/** Instructions for the moderation classifier. */
export function moderationRules(kind: "matchup" | "shout_out") {
  return (
    `You moderate content for Tugg, a playful rivalry site. ALLOWED: ${ALLOWED_SUBJECTS}. NOT ALLOWED: ${NOT_ALLOWED_SUBJECTS}. ` +
    (kind === "shout_out"
      ? "This is a short shout-out message attached to a pull. Allow friendly trash talk; reject anything above or personal attacks."
      : `This is a new two-sided matchup (title, sides, description). ${REAL_PERSON_RULE}`)
  );
}
