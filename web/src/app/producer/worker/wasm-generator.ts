import init, { InitInput, MarketGenerator, updateStride } from '@market-gen';
import { UPDATE_STRIDE } from '../../domain/market-update';
import { GeneratorFactory } from './ports';

/** Generator wasm copied to the app's `wasm/` asset folder, relative to the document base URI. */
const WASM_ASSET = 'wasm/market_gen_bg.wasm';
export const wasmUrl = (baseUri: string): string => new URL(WASM_ASSET, baseUri).href;

/** Initialises the wasm-bindgen module (once per realm) and returns a generator factory. */
export const loadWasmGenerator = async (source: InitInput): Promise<GeneratorFactory> => {
  await init({ module_or_path: source });
  const stride = updateStride();
  if (stride !== UPDATE_STRIDE)
    throw new Error(`Wasm update stride ${stride} does not match UPDATE_STRIDE ${UPDATE_STRIDE}`);
  return (seed, instrumentCount) => {
    const generator = new MarketGenerator(seed, instrumentCount);
    return {
      generate: (batchSize) => generator.generate(batchSize),
      dispose: () => generator.free(),
    };
  };
};
