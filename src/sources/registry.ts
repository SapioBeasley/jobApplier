import type { SourceAdapter } from "./types";
import { builtinAdapter } from "./builtin";
import { globalworkAdapter } from "./globalwork";
import { remoteCoAdapter } from "./remote-co";
import { wellfoundAdapter } from "./wellfound";

export const sourceAdapters: SourceAdapter[] = [
  builtinAdapter,
  globalworkAdapter,
  remoteCoAdapter,
  wellfoundAdapter,
];
