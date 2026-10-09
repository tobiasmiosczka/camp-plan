import * as PlotlyJS from 'plotly.js-dist-min';
import {Data, Layout, LayoutAxis} from 'plotly.js-dist-min';
import {ReportChart} from '../pdf-export';

/** Ein fertig aufgebautes Diagramm mit Überschrift, wie es die Karte und die PDF zeigen. */
export interface Figure {
  data: Data[];
  layout: Partial<Layout>;
  title: string;
  subtitle: string;
}

export const NO_SCENARIOS: string = 'Keine Szenarien: Trage bei den Städten Teilnehmer ein.';

/**
 * Farben und Grundlayout der Diagramme aus dem Material-Theme.
 * Für Papier (`print`) immer die hellen Theme-Farben, unabhängig vom gewählten Farbmodus.
 */
export class ChartStyle {

  constructor(private readonly print: boolean = false) {
  }

  /** Löst eine Material-Farbvariable (ggf. light-dark()) in einen von Plotly lesbaren rgb-Wert auf. */
  color(variable: string): string {
    const probe: HTMLSpanElement = document.createElement('span');
    probe.style.color = `var(${variable})`;
    if (this.print) {
      // light-dark() wertet das Farbschema des Elements aus: so entstehen die hellen Farben auch im Dunkelmodus
      probe.style.colorScheme = 'light';
    }
    document.body.appendChild(probe);
    const color: string = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }

  base(): Partial<Layout> {
    return {
      autosize: true,
      separators: ',.',
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: {family: 'Roboto, sans-serif', color: this.color('--mat-sys-on-surface')},
      hoverlabel: {
        bgcolor: this.color('--mat-sys-surface-container-highest'),
        bordercolor: this.color('--mat-sys-outline-variant'),
        font: {family: 'Roboto, sans-serif', color: this.color('--mat-sys-on-surface')},
      },
    };
  }

  /** Euro-Werte auf der y-Achse, gestrichelte Linie bei 0 €. */
  cartesian(valueLabel: string): Partial<Layout> {
    return {
      ...this.base(),
      margin: {l: 96, r: 24, t: 40, b: 56},
      yaxis: {
        ...this.axis(),
        title: {text: valueLabel},
        ticksuffix: ' €',
        tickformat: ',.0f',
        rangemode: 'tozero',
      },
      legend: {orientation: 'h', x: 0, y: 1.08, traceorder: 'normal'},
      shapes: [{
        type: 'line',
        xref: 'paper',
        x0: 0,
        x1: 1,
        y0: 0,
        y1: 0,
        line: {color: this.color('--mat-sys-error'), width: 1, dash: 'dash'}
      }],
    };
  }

  axis(): Partial<LayoutAxis> {
    return {
      gridcolor: this.color('--mat-sys-outline-variant'),
      linecolor: this.color('--mat-sys-outline'),
      zeroline: false,
    };
  }

  sceneAxis() {
    return {
      gridcolor: this.color('--mat-sys-outline-variant'),
      linecolor: this.color('--mat-sys-outline'),
      zerolinecolor: this.color('--mat-sys-outline'),
      showbackground: false,
    };
  }
}

export function withAlpha(rgb: string, alpha: number): string {
  return rgb.replace(/^rgb\((.*)\)$/, `rgba($1, ${alpha})`);
}

/** Das Diagramm für Papier als JPEG für die PDF; `aspect` ist die Höhe im Verhältnis zur Breite. */
export async function reportChart(figure: Figure, aspect: number): Promise<ReportChart | null> {
  if (figure.data.length === 0) {
    return null;
  }
  const width: number = 1200;
  return {
    title: figure.title,
    subtitle: figure.subtitle,
    image: await PlotlyJS.toImage({data: figure.data, layout: forPaper(figure.layout)},
      {format: 'jpeg', width, height: Math.round(width * aspect)}),
    aspect,
  };
}

/** Weißer Hintergrund und dunkle Achsen, damit das Diagramm auf Papier lesbar ist. */
function forPaper(layout: Partial<Layout>): Partial<Layout> {
  // Ohne Typangabe passt das Objekt sowohl zu 2D- als auch zu 3D-Achsen
  const axis = {gridcolor: '#dde3e3', linecolor: '#6f7979', color: '#191c1c'};
  return {
    ...layout,
    font: {...layout.font, color: '#191c1c'},
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    xaxis: {...layout.xaxis, ...axis},
    yaxis: {...layout.yaxis, ...axis},
    scene: layout.scene && {
      ...layout.scene,
      xaxis: {...layout.scene.xaxis, ...axis},
      yaxis: {...layout.scene.yaxis, ...axis},
      zaxis: {...layout.scene.zaxis, ...axis},
    },
  };
}
