/**
 * Alle Texte der Oberfläche und der PDF auf Deutsch. Diese Datei gibt die Struktur vor: {@link Messages} wird aus ihr
 * abgeleitet, jede weitere Sprache muss dieselben Schlüssel mit denselben Parametern liefern.
 *
 * Texte mit Zahlen formatieren diese selbst, damit Tausendertrenner und Dezimalzeichen zur Sprache passen.
 */
export const DE = {
  /** Locale-ID für Angular-Pipes und Intl. */
  locale: 'de',
  /** Name der Sprache in ihr selbst, wie er in der Sprachauswahl steht. */
  name: 'Deutsch',

  common: {
    from: 'von',
    to: 'bis',
    ok: 'OK',
    undo: 'Rückgängig',
    deleted: (name: string): string => `„${name}“ gelöscht`,
    perParticipant: 'pro Teilnehmer',
    surplus: 'Überschuss',
    debit: 'Ausgaben',
    credit: 'Einnahmen',
    days: 'Tage',
    leaders: 'Leiter',
    participantsTotal: 'Teilnehmer gesamt',
    city: 'Stadt',
    /** Anzeigename der Sammelstadt für alle Teilnehmenden ohne eigene Stadt. */
    others: 'Sonstige',
    scenarios: (count: number): string => `${count.toLocaleString('de')} Szenarien`,
  },

  topBar: {
    open: 'Plan öffnen',
    openShortcut: 'Plan öffnen (Strg+O)',
    save: 'Plan speichern',
    saveShortcut: 'Plan speichern (Strg+S)',
    exportPdf: 'Als PDF exportieren',
    moreActions: 'Weitere Aktionen',
    darkMode: 'Dunkler Modus',
    language: 'Sprache',
    loadExample: 'Beispielplan laden',
    resetAll: 'Alle Einstellungen zurücksetzen',
    calculating: 'Berechnung läuft',
    opened: (file: string): string => `„${file}“ geöffnet`,
    openFailed: 'Datei konnte nicht geöffnet werden.',
    pdfFailed: 'PDF konnte nicht erstellt werden.',
    exampleLoaded: 'Beispielplan geladen',
    allReset: 'Alle Einstellungen zurückgesetzt',
  },

  project: {
    name: 'Projektname',
    placeholder: 'z. B. Sommerlager 2027',
  },

  summary: {
    title: (perParticipant: boolean): string => perParticipant ? 'Überschuss pro Teilnehmer' : 'Überschuss gesamt',
    calculating: 'Wird berechnet …',
    deficit: 'In mindestens einem Szenario entsteht ein Defizit.',
    calculationFailed: (reason: string): string => `Berechnung fehlgeschlagen: ${reason}`,
    retry: 'Erneut versuchen',
    calculationAborted: 'Die Berechnung ist abgebrochen.',
  },

  settings: {
    title: 'Rahmenbedingungen',
    subtitle: 'Bereiche, für die das Lager durchgerechnet wird',
  },

  cities: {
    title: 'Teilnehmende Städte',
    subtitle: (participants: string): string => `${participants} Teilnehmer insgesamt`,
    remove: 'Stadt löschen',
    add: 'Stadt hinzufügen',
    inUse: (city: string, positions: string[]): string =>
      `${city} wird noch verwendet in ${positions.map((title: string): string => `„${title}“`).join(', ')}.`,
    newCity: 'Neue Stadt',
  },

  positions: {
    name: 'Name',
    amount: 'Betrag',
    amountInEuro: 'Betrag in Euro',
    multipliedBy: 'Multipliziert mit',
    sum: 'Summe',
    total: (side: string): string => `Summe ${side}`,
    remove: 'Position löschen',
    add: 'Position hinzufügen',
    newPosition: 'Neue Position',
  },

  modifiers: {
    person: 'pro Person',
    participant: 'pro Teilnehmer',
    leader: 'pro Leiter',
    day: 'pro Tag',
    night: 'pro Nacht',
    personGroup: (size: number): string => `pro ${size} Personen`,
    participantGroup: (size: number): string => `pro ${size} Teilnehmer`,
    city: (city: string): string => `pro Teilnehmer aus ${city}`,
    /** Einträge im Menü „Faktor hinzufügen“. */
    options: {
      person: 'pro Person',
      participant: 'pro Teilnehmer',
      leader: 'pro Leiter',
      day: 'pro Tag',
      night: 'pro Nacht',
      personGroup: 'pro X Personen',
      participantGroup: 'pro X Teilnehmer',
      city: 'pro Teilnehmer aus …',
    },
    /** Bausteine der bearbeitbaren Chips: „pro [10] Personen“, „pro Teilnehmer aus [Stadt]“. */
    per: 'pro',
    perParticipantFrom: 'pro Teilnehmer aus',
    units: {personGroup: 'Personen', participantGroup: 'Teilnehmer'},
    groupSize: 'Gruppengröße',
    removeModifier: (modifier: string): string => `Entferne ${modifier}`,
    add: 'Faktor hinzufügen',
  },

  charts: {
    loading: 'Diagramm wird geladen …',
    noScenarios: 'Keine Szenarien: Trage bei den Städten Teilnehmer ein.',
    minimum: 'Minimum',
    maximum: 'Maximum',
    xAxis: 'X-Achse',
    yAxis: 'Y-Achse',
    none: 'keine',
    participantsFrom: (city: string): string => `Teilnehmer aus ${city}`,
    surplus: (perParticipant: boolean): string => perParticipant ? 'Überschuss pro Teilnehmer' : 'Überschuss',
    surfaceBand: 'Zwei Flächen: Minimum und Maximum über alle übrigen Größen; flache Ebene = 0 €',
    surfaceFlat: 'Flache Ebene = 0 €',
    band: 'Spanne von Minimum bis Maximum über alle übrigen Größen',
    distribution: 'Verteilung der Szenarien',
    distributionOf: (metric: string): string => `Verteilung der Szenarien: ${metric}`,
    metric: 'Dargestellte Größe',
    mean: (value: string): string => `Mittelwert ${value}`,
    deficitShare: (share: string): string => `Defizit in ${share} der Szenarien`,
    binRange: (from: string, to: string): string => `${from} bis ${to}`,
    scenarioCount: 'Anzahl Szenarien',
    /** Plotly-Platzhalter: Anzahl der Szenarien einer Säule. */
    scenariosTemplate: '%{y:,.0f} Szenarien',
  },

  pdf: {
    title: 'CampPlan – Kalkulation',
    subtitle: 'CampPlan-Kalkulation',
    asOf: (date: Date): string =>
      `Stand: ${date.toLocaleString('de', {dateStyle: 'long', timeStyle: 'short'})}`,
    overview: 'Übersicht',
    key: 'Kennzahl',
    value: 'Wert',
    surplusTotal: 'Überschuss gesamt',
    scenarios: 'Szenarien',
    deficitScenarios: 'Szenarien mit Defizit',
    setting: 'Rahmenbedingung',
    position: 'Position',
    page: (page: number, pages: number): string => `Seite ${page} von ${pages}`,
  },

  /** Meldungen zu Plandateien, nach dem Code des {@link PlanFileError}. */
  planFile: {
    invalidJson: 'Die Datei ist kein gültiges JSON.',
    unknownVersion: 'Die Datei ist kein CampPlan-Plan oder hat eine unbekannte Version.',
    missingCities: 'Städte fehlen in der Datei.',
    invalidCity: 'Ungültige Stadt in der Datei.',
    invalidRange: (subject: string): string => `Ungültiger Bereich für ${subject}.`,
    invalidModifier: 'Ungültiger Faktor in der Datei.',
    unknownModifier: (type: string): string => `Unbekannter Faktor „${type}“ in der Datei.`,
    unknownCity: 'Ein Faktor verweist auf eine unbekannte Stadt.',
    invalidGroupSize: 'Ungültige Gruppengröße in der Datei.',
    missingPositions: (side: string): string => `${side} fehlen in der Datei.`,
    invalidPosition: (side: string): string => `Ungültige Position in ${side}.`,
  },
};

export type Messages = typeof DE;
