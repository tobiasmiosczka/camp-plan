declare const brand: unique symbol;

/**
 * Eine ID, die nur zu Elementen ihrer Art passt: Eine Positions-ID lässt sich nicht versehentlich als Stadt-ID
 * übergeben. Zur Laufzeit ein gewöhnlicher String.
 */
export type Id<Kind extends string> = string & { readonly [brand]: Kind };

export type CityId = Id<'city'>;
export type PositionId = Id<'position'>;

let last: number = 0;

/**
 * Eine neue ID, eindeutig, solange die App läuft. Gespeichert werden IDs nicht: Beim Laden bekommt jedes Element eine
 * neue.
 */
export function newId<Kind extends string>(): Id<Kind> {
  return `${++last}` as Id<Kind>;
}
