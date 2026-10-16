/** Eine Größe, die in jedem Szenario einen festen Wert hat. */
export type ContextType = 'participants' | 'leaders' | 'days';

/** Die Größen, die man direkt einstellt; die Teilnehmer ergeben sich aus den Städten. */
export type AdjustableType = Exclude<ContextType, 'participants'>;

/** Die Zahlen eines Szenarios, nach denen sich die Faktoren richten. */
export interface Context {
  readonly participants: number;
  readonly leaders: number;
  readonly days: number;
  /** Teilnehmer je Stadt-ID; nur für Städte, die einzeln aufgezählt wurden. */
  readonly cities?: ReadonlyMap<string, number>;
}
