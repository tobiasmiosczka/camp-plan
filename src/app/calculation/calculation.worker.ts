/// <reference lib="webworker" />

import {EngineRequest, EngineResponse, EngineResult, evaluate, transferables} from './engine';

addEventListener('message', ({data}: MessageEvent<EngineRequest>): void => {
  let result: EngineResult;
  try {
    result = evaluate(data.plan, data.perParticipant);
  } catch (error) {
    postMessage({id: data.id, error: error instanceof Error ? error.message : String(error)} satisfies EngineResponse);
    return;
  }
  postMessage({id: data.id, result} satisfies EngineResponse, transferables(result));
});
