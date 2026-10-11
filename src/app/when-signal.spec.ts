import { ApplicationRef, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { whenSignal } from './when-signal';

describe('whenSignal', () => {
  const injector = () => TestBed.inject(Injector);
  const settle = (): Promise<void> => TestBed.inject(ApplicationRef).whenStable();

  it('fulfils at once when the current value already fits', async () => {
    const source = signal(3);

    expect(await whenSignal(source, value => value > 2, injector())).toBe(3);
  });

  it('waits for a value that fits', async () => {
    const source = signal(1);
    let result: number | undefined;
    whenSignal(source, value => value > 2, injector()).then(value => result = value);

    source.set(2);
    await settle();
    expect(result).toBeUndefined();

    source.set(5);
    await settle();
    expect(result).toBe(5);
  });

  it('never hands out a value that is out of date by the time it is checked', async () => {
    const source = signal(1);
    let result: number | undefined;
    whenSignal(source, value => value > 2, injector()).then(value => result = value);

    // Kurzzeitig passend, aber schon wieder überholt, bevor jemand nachsieht
    source.set(7);
    source.set(1);
    await settle();
    expect(result).toBeUndefined();

    source.set(9);
    await settle();
    expect(result).toBe(9);
  });

  it('stops watching once fulfilled', async () => {
    const source = signal(1);
    const accept = vi.fn((value: number) => value > 2);
    const done = whenSignal(source, accept, injector());

    source.set(3);
    await done;
    const calls = accept.mock.calls.length;
    source.set(4);
    await settle();

    expect(accept.mock.calls.length).toBe(calls);
  });
});
