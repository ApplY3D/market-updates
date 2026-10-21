//! Wasm entry point. Only the binding layer lives here; the model is plain Rust
//! so it can be tested natively with `cargo test`.

mod model;
mod rng;

pub use model::{
    ConfigError, MAX_BATCH_SIZE, MAX_INSTRUMENTS, MarketGenerator, MarketUpdate, UPDATE_STRIDE,
};
use wasm_bindgen::prelude::*;

/// Stateful market data generator exposed to JavaScript.
#[wasm_bindgen(js_name = MarketGenerator)]
pub struct WasmMarketGenerator {
    inner: MarketGenerator,
}

#[wasm_bindgen(js_class = MarketGenerator)]
impl WasmMarketGenerator {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u64, instrument_count: u32) -> Result<WasmMarketGenerator, JsError> {
        let inner = MarketGenerator::new(seed, instrument_count).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(getter, js_name = instrumentCount)]
    pub fn instrument_count(&self) -> u32 {
        self.inner.instrument_count()
    }

    /// Returns `batch_size` updates packed as `updateStride()` fields each.
    pub fn generate(&mut self, batch_size: u32) -> Result<Vec<u32>, JsError> {
        self.inner.generate(batch_size).map_err(to_js_error)
    }
}

/// Number of `u32` fields per packed update.
#[wasm_bindgen(js_name = updateStride)]
pub fn update_stride() -> u32 {
    UPDATE_STRIDE as u32
}

fn to_js_error(error: ConfigError) -> JsError {
    JsError::new(&error.to_string())
}
