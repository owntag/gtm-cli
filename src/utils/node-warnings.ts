/**
 * Silence Node.js deprecation warnings emitted by npm dependencies under Deno's Node compatibility
 * layer (e.g. "[DEP0040] The `punycode` module is deprecated" from googleapis). Must be imported
 * before any module that loads those dependencies.
 */
import process from "node:process";

(process as unknown as { noDeprecation: boolean }).noDeprecation = true;
