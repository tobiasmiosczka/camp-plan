/// <reference lib="webworker" />

import {EngineRequest, EngineResponse, EngineResult, evaluate, transferables} from './engine';

/** Höchstens so oft eine Fortschrittsmeldung: Jede Nachricht kostet, der Ladebalken braucht nicht mehr. */
const PROGRESS_INTERVAL_MS: number = 50;

addEventListener('message', ({data}: MessageEvent<EngineRequest>): void => {
  let reported: number = performance.now();
  const progress = (share: number): void => {
    const now: number = performance.now();
    if (now - reported >= PROGRESS_INTERVAL_MS) {
      reported = now;
      postMessage({id: data.id, progress: share} satisfies EngineResponse);
    }
  };
  let result: EngineResult;
  try {
    result = evaluate(data.plan, data.perParticipant, progress);
  } catch (error) {
    postMessage({id: data.id, error: error instanceof Error ? error.message : String(error)} satisfies EngineResponse);
    return;
  }
  postMessage({id: data.id, result} satisfies EngineResponse, transferables(result));
});
