import {Injectable, OnDestroy} from '@angular/core';
import {EngineRequest, EngineResponse, EngineResult, evaluate} from './calculation/engine';

interface Pending {
  id: number;
  resolve: (result: EngineResult) => void;
  reject: (error: Error) => void;
}

/**
 * Rechnet Pläne in einem Web Worker, damit die Oberfläche auch bei Millionen Szenarien bedienbar bleibt.
 *
 * Es läuft immer nur eine Rechnung. Eine neue Anfrage oder ein `abortSignal` bricht die laufende ab: Den Worker zu
 * beenden ist schneller, als eine überholte Rechnung abzuwarten. Ohne Worker (z. B. in Tests unter jsdom) wird im
 * Haupt-Thread gerechnet.
 */
@Injectable({providedIn: 'root'})
export class CalculationRunner implements OnDestroy {

  private worker: Worker | null = null;
  private pending: Pending | null = null;
  private nextId: number = 0;

  run(plan: string, perParticipant: boolean, abortSignal?: AbortSignal): Promise<EngineResult> {
    if (typeof Worker === 'undefined') {
      return Promise.resolve().then((): EngineResult => evaluate(plan, perParticipant));
    }
    this.cancel();
    const worker: Worker = this.worker ??= this.createWorker();
    const id: number = ++this.nextId;
    return new Promise<EngineResult>((resolve, reject): void => {
      this.pending = {id, resolve, reject};
      abortSignal?.addEventListener('abort', (): void => {
        if (this.pending?.id === id) {
          this.cancel();
        }
      }, {once: true});
      worker.postMessage({id, plan, perParticipant} satisfies EngineRequest);
    });
  }

  ngOnDestroy(): void {
    this.cancel();
    this.worker?.terminate();
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL('./calculation/calculation.worker', import.meta.url), {type: 'module'});
    worker.addEventListener('message', ({data}: MessageEvent<EngineResponse>): void => {
      const pending: Pending | null = this.pending;
      if (pending?.id !== data.id) {
        return;
      }
      this.pending = null;
      if ('error' in data) {
        pending.reject(new Error(data.error));
      } else {
        pending.resolve(data.result);
      }
    });
    worker.addEventListener('error', (event: ErrorEvent): void => {
      // Ein abgestürzter Worker wird bei der nächsten Anfrage neu gestartet
      const pending: Pending | null = this.pending;
      this.pending = null;
      this.worker = null;
      worker.terminate();
      pending?.reject(new Error(event.message || 'Die Berechnung ist abgebrochen.'));
    });
    return worker;
  }

  /** Beendet den Worker nur, wenn er gerade rechnet; ein freier Worker bleibt für die nächste Anfrage. */
  private cancel(): void {
    if (this.pending === null) {
      return;
    }
    this.worker?.terminate();
    this.worker = null;
    this.pending.reject(new DOMException('Die Berechnung wurde abgebrochen.', 'AbortError'));
    this.pending = null;
  }
}
