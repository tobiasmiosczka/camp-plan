import {effect, EffectRef, Injector, Signal, untracked} from '@angular/core';

/**
 * Erfüllt sich mit dem ersten Wert des Signals, für den `accept` zutrifft – sofort, wenn schon der aktuelle passt.
 *
 * Bewusst über einen Effekt statt über `toObservable`: Das meldet einem neuen Abonnenten zuerst den zuletzt gesehenen
 * Wert, auch wenn sich das Signal seitdem geändert hat. Wer darauf wartet, bekäme so einen veralteten Wert.
 */
export function whenSignal<T, S extends T>(source: Signal<T>, accept: (value: T) => value is S,
                                           injector: Injector): Promise<S>;
export function whenSignal<T>(source: Signal<T>, accept: (value: T) => boolean, injector: Injector): Promise<T>;
export function whenSignal<T>(source: Signal<T>, accept: (value: T) => boolean, injector: Injector): Promise<T> {
  const current: T = untracked(source);
  if (accept(current)) {
    return Promise.resolve(current);
  }
  return new Promise<T>((resolve): void => {
    const watcher: EffectRef = effect((): void => {
      const value: T = source();
      if (accept(value)) {
        watcher.destroy();
        resolve(value);
      }
    }, {injector});
  });
}
