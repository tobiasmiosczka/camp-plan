# CampPlan

Rechnet die Kosten eines Zeltlagers für alle denkbaren Szenarien durch: Für jede Kombination aus Teilnehmern je
Stadt, Leitern und Tagen ergibt sich ein Überschuss oder Defizit. Die App zeigt die Spannen, Diagramme und eine PDF.

## Entwicklung

```bash
npm ci
ng serve     # http://localhost:4200/
ng test      # Vitest; ein roter Test verhindert das Deployment
ng build     # nach dist/
```

Jeder Push auf `main` wird über `.github/workflows/deploy.yml` auf GitHub Pages veröffentlicht.

## Aufbau

```
src/app/
  calculation/       Rechenkern: Modell, Dateiformat, Szenarien, Rechnung. Ohne Angular, läuft im Web Worker.
  plan-calculation/  Rechnet den Plan aus dem Store im Worker, bricht überholte Rechnungen ab.
  stores/            Plan, Sprache und Farbschema; nur sie lesen und schreiben den Browser-Speicher.
  pdf/               Report aus Plan und Ergebnis, Layout mit jsPDF (erst bei Bedarf geladen).
  charts/            Diagramme mit Plotly (erst bei Bedarf geladen); der Aufbau steckt in reinen Funktionen.
  format/            Zahlen- und Betragsformate, Euro-Eingabe, Dateinamen und Download.
  i18n/              Texte auf Deutsch und Englisch; der Rechenkern kennt keine Sprachen.
  testing/           Testpläne und Hilfen, nur für Specs.
  …                  Je Karte der Oberfläche ein Ordner.
```

`architecture.spec.ts` prüft die wichtigsten Regeln dieser Aufteilung, etwa dass der Rechenkern nichts außerhalb
von `calculation/` importiert oder Plotly nicht im Startpaket landet.

### Datenfluss

1. **`PlanStore`** hält den Plan. Er ist unveränderlich: Jede Änderung ersetzt ihn durch einen neuen, unveränderte
   Teile werden übernommen. Städte und Positionen haben IDs (`CityId`, `PositionId`), über die Faktoren, Ergebnisse
   und Tabellenzeilen sie wiederfinden. Nur der Store ändert den Plan.
2. **`PlanCalculation`** rechnet neu, sobald sich eine Zahl ändert (`calculationKey`); Umbenennen löst keine Rechnung
   aus. Die Rechnung läuft im Web Worker, den der `CalculationRunner` bei jeder neuen Anfrage abbricht und neu startet.
3. **Rechenkern:** `enumerateScenarios` zählt alle Szenarien als Spalten (`Int32Array`) auf, `calculate` rechnet
   jede Position. Das Ergebnis kommt ohne Kopie aus dem Worker zurück.
4. **`ScenarioResults`** gruppiert die Ergebnisse für Diagramme neu, ohne erneut zu rechnen.

### Zusammengefasste Städte

Einzeln aufgezählt werden nur Städte, auf die ein Faktor „pro Teilnehmer aus …“ verweist. Alle übrigen zählen nur
über die Gesamtzahl und werden zu einer Spanne zusammengefasst; jedes solche Szenario steht mit einem Gewicht für
alle echten, die es vertritt. Mittelwerte, Defizitanteile und Histogramme rechnen mit diesen Gewichten und ergeben
dasselbe wie eine vollständige Aufzählung (siehe `scenario-results.spec.ts`).

### Dateiformat

Pläne werden als JSON gespeichert, in Dateien wie im Browser-Speicher (`plan-file.ts`, aktuell Version 2;
Version 1 wird noch gelesen). Faktoren verweisen dort über den Index auf ihre Stadt, IDs werden nicht gespeichert.
Fehler beim Lesen beschreibt ein `PlanFileProblem`, das die Oberfläche übersetzt.

### Typen und Tempo

Der Compiler läuft mit `noUncheckedIndexedAccess` und `exactOptionalPropertyTypes`. Nur in den Schleifen über
Szenarien in `calculator.ts`, `enumerate.ts`, `scenario-results.ts` und `histogram.ts` stehen ungeprüfte Zugriffe
(`!`): Dort würde eine Prüfung je Szenario die Rechnung bremsen.
