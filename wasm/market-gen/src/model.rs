use core::fmt;

use crate::rng::Rng;

/// Number of `u32` fields per update in the packed output:
/// `[instrument, priceCents, tradeQuantity, bidCents, askCents, bidQuantity, askQuantity]`.
pub const UPDATE_STRIDE: usize = 7;
pub const MAX_INSTRUMENTS: u32 = 1_000;
pub const MAX_BATCH_SIZE: u32 = 100_000;

const MIN_MID_CENTS: f64 = 100.0;
const MAX_MID_CENTS: f64 = 10_000_000.0;
/// Per-update standard deviation of the mid as a fraction of price.
const VOLATILITY: f64 = 0.0005;
/// Mid drift per unit of book imbalance, in standard deviations.
const IMBALANCE_DRIFT: f64 = 0.3;
const SIDE_BIAS: f64 = 0.25;
const SPREAD_FRACTION: f64 = 0.0002;
const BOOK_MEAN: f64 = 500.0;
const BOOK_REVERSION: f64 = 0.1;
const BOOK_NOISE: f64 = 80.0;
const MAX_BOOK_QUANTITY: f64 = 100_000.0;
const TRADE_QUANTITY_MEAN: f64 = 40.0;
const MAX_TRADE_QUANTITY: f64 = 1_000.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MarketUpdate {
    pub instrument: u32,
    pub price_cents: u32,
    pub trade_quantity: u32,
    pub bid_cents: u32,
    pub ask_cents: u32,
    pub bid_quantity: u32,
    pub ask_quantity: u32,
}

impl MarketUpdate {
    pub fn write_to(&self, out: &mut Vec<u32>) {
        out.extend_from_slice(&[
            self.instrument,
            self.price_cents,
            self.trade_quantity,
            self.bid_cents,
            self.ask_cents,
            self.bid_quantity,
            self.ask_quantity,
        ]);
    }

    pub fn read_from(fields: &[u32]) -> Self {
        Self {
            instrument: fields[0],
            price_cents: fields[1],
            trade_quantity: fields[2],
            bid_cents: fields[3],
            ask_cents: fields[4],
            bid_quantity: fields[5],
            ask_quantity: fields[6],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfigError {
    InstrumentCount(u32),
    BatchSize(u32),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InstrumentCount(n) => {
                write!(f, "instrument count must be 1..={MAX_INSTRUMENTS}, got {n}")
            }
            Self::BatchSize(n) => write!(f, "batch size must be 1..={MAX_BATCH_SIZE}, got {n}"),
        }
    }
}

#[derive(Debug, Clone)]
struct InstrumentState {
    mid_cents: u32,
    bid_quantity: u32,
    ask_quantity: u32,
}

#[derive(Debug, Clone)]
pub struct MarketGenerator {
    rng: Rng,
    instruments: Vec<InstrumentState>,
}

impl MarketGenerator {
    pub fn new(seed: u64, instrument_count: u32) -> Result<Self, ConfigError> {
        if !(1..=MAX_INSTRUMENTS).contains(&instrument_count) {
            return Err(ConfigError::InstrumentCount(instrument_count));
        }
        let mut rng = Rng::new(seed);
        let instruments = (0..instrument_count)
            .map(|_| InstrumentState {
                mid_cents: rng.between(1_000, 50_000),
                bid_quantity: rng.between(200, 800),
                ask_quantity: rng.between(200, 800),
            })
            .collect();
        Ok(Self { rng, instruments })
    }

    pub fn instrument_count(&self) -> u32 {
        self.instruments.len() as u32
    }

    pub fn generate(&mut self, batch_size: u32) -> Result<Vec<u32>, ConfigError> {
        if !(1..=MAX_BATCH_SIZE).contains(&batch_size) {
            return Err(ConfigError::BatchSize(batch_size));
        }
        let mut out = Vec::with_capacity(batch_size as usize * UPDATE_STRIDE);
        for _ in 0..batch_size {
            self.next_update().write_to(&mut out);
        }
        Ok(out)
    }

    pub fn next_update(&mut self) -> MarketUpdate {
        let instrument = self.rng.below(self.instrument_count());
        let state = &mut self.instruments[instrument as usize];
        step(&mut self.rng, state, instrument)
    }
}

fn step(rng: &mut Rng, state: &mut InstrumentState, instrument: u32) -> MarketUpdate {
    state.bid_quantity = walk_book(rng, state.bid_quantity);
    state.ask_quantity = walk_book(rng, state.ask_quantity);
    let pressure = imbalance(state.bid_quantity, state.ask_quantity);

    let mid = f64::from(state.mid_cents);
    let shock = rng.normal() + IMBALANCE_DRIFT * pressure;
    let next_mid = (mid + (mid * VOLATILITY * shock).round()).clamp(MIN_MID_CENTS, MAX_MID_CENTS);
    state.mid_cents = next_mid as u32;

    let min_spread = ((next_mid * SPREAD_FRACTION).round() as u32).max(1);
    let spread = rng.between(min_spread, min_spread * 2);
    let bid_cents = state.mid_cents.saturating_sub(spread / 2).max(1);
    let ask_cents = bid_cents + spread;

    let trade_quantity =
        (1.0 + rng.exponential(TRADE_QUANTITY_MEAN)).min(MAX_TRADE_QUANTITY) as u32;
    let is_buy = rng.chance(0.5 + SIDE_BIAS * pressure);
    let price_cents = if is_buy {
        state.ask_quantity = state.ask_quantity.saturating_sub(trade_quantity);
        ask_cents
    } else {
        state.bid_quantity = state.bid_quantity.saturating_sub(trade_quantity);
        bid_cents
    };

    MarketUpdate {
        instrument,
        price_cents,
        trade_quantity,
        bid_cents,
        ask_cents,
        bid_quantity: state.bid_quantity,
        ask_quantity: state.ask_quantity,
    }
}

fn walk_book(rng: &mut Rng, quantity: u32) -> u32 {
    let q = f64::from(quantity);
    let next = q + BOOK_REVERSION * (BOOK_MEAN - q) + BOOK_NOISE * rng.normal();
    next.round().clamp(0.0, MAX_BOOK_QUANTITY) as u32
}

fn imbalance(bid_quantity: u32, ask_quantity: u32) -> f64 {
    let total = f64::from(bid_quantity) + f64::from(ask_quantity);
    if total == 0.0 {
        0.0
    } else {
        (f64::from(bid_quantity) - f64::from(ask_quantity)) / total
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode(packed: &[u32]) -> Vec<MarketUpdate> {
        assert_eq!(packed.len() % UPDATE_STRIDE, 0);
        packed
            .chunks_exact(UPDATE_STRIDE)
            .map(MarketUpdate::read_from)
            .collect()
    }

    fn assert_valid(update: &MarketUpdate, instrument_count: u32) {
        assert!(update.instrument < instrument_count, "{update:?}");
        assert!(update.price_cents > 0, "{update:?}");
        assert!(update.bid_cents > 0, "{update:?}");
        assert!(update.bid_cents < update.ask_cents, "{update:?}");
        assert!(
            update.price_cents == update.bid_cents || update.price_cents == update.ask_cents,
            "{update:?}"
        );
        assert!(update.trade_quantity >= 1, "{update:?}");
    }

    #[test]
    fn rejects_invalid_instrument_counts() {
        assert_eq!(
            MarketGenerator::new(1, 0).unwrap_err(),
            ConfigError::InstrumentCount(0)
        );
        assert!(MarketGenerator::new(1, MAX_INSTRUMENTS + 1).is_err());
        assert!(MarketGenerator::new(1, 1).is_ok());
        assert!(MarketGenerator::new(1, MAX_INSTRUMENTS).is_ok());
    }

    #[test]
    fn rejects_invalid_batch_sizes() {
        let mut generator = MarketGenerator::new(1, 5).unwrap();
        assert_eq!(
            generator.generate(0).unwrap_err(),
            ConfigError::BatchSize(0)
        );
        assert!(generator.generate(MAX_BATCH_SIZE + 1).is_err());
    }

    #[test]
    fn returns_exactly_the_requested_batch_size() {
        let mut generator = MarketGenerator::new(1, 5).unwrap();
        for size in [1, 2, 7, 100, 1_000] {
            let packed = generator.generate(size).unwrap();
            assert_eq!(packed.len(), size as usize * UPDATE_STRIDE);
        }
    }

    #[test]
    fn generated_values_satisfy_invariants() {
        for (seed, count) in [(1, 1), (2, 5), (3, 50), (0xDEAD_BEEF, 17)] {
            let mut generator = MarketGenerator::new(seed, count).unwrap();
            for _ in 0..50 {
                for update in decode(&generator.generate(1_000).unwrap()) {
                    assert_valid(&update, count);
                }
            }
        }
    }

    #[test]
    fn same_seed_is_deterministic() {
        let mut a = MarketGenerator::new(99, 10).unwrap();
        let mut b = MarketGenerator::new(99, 10).unwrap();
        assert_eq!(a.generate(500).unwrap(), b.generate(500).unwrap());
    }

    #[test]
    fn different_seeds_produce_different_data() {
        let mut a = MarketGenerator::new(1, 10).unwrap();
        let mut b = MarketGenerator::new(2, 10).unwrap();
        assert_ne!(a.generate(100).unwrap(), b.generate(100).unwrap());
    }

    #[test]
    fn every_instrument_is_selected_and_may_repeat_within_a_batch() {
        let mut generator = MarketGenerator::new(5, 10).unwrap();
        let updates = decode(&generator.generate(1_000).unwrap());
        let mut counts = [0u32; 10];
        for update in &updates {
            counts[update.instrument as usize] += 1;
        }
        assert!(counts.iter().all(|&c| c > 1), "{counts:?}");
    }

    #[test]
    fn trades_happen_on_both_sides_of_the_quote() {
        let mut generator = MarketGenerator::new(8, 3).unwrap();
        let updates = decode(&generator.generate(1_000).unwrap());
        assert!(updates.iter().any(|u| u.price_cents == u.bid_cents));
        assert!(updates.iter().any(|u| u.price_cents == u.ask_cents));
    }

    #[test]
    fn prices_evolve_from_previous_values_across_calls() {
        let mut generator = MarketGenerator::new(21, 1).unwrap();
        let mut previous: Option<u32> = None;
        let mut distinct_prices = std::collections::HashSet::new();

        // Many small batches: state must carry over between `generate` calls.
        for _ in 0..2_000 {
            for update in decode(&generator.generate(5).unwrap()) {
                if let Some(prev) = previous {
                    let change = (f64::from(update.price_cents) / f64::from(prev) - 1.0).abs();
                    assert!(change < 0.01, "jump from {prev} to {}", update.price_cents);
                }
                previous = Some(update.price_cents);
                distinct_prices.insert(update.price_cents);
            }
        }
        assert!(distinct_prices.len() > 50, "price barely moves");
    }

    #[test]
    fn instruments_keep_independent_prices() {
        let mut generator = MarketGenerator::new(4, 2).unwrap();
        let mut last = [None::<u32>; 2];
        for update in decode(&generator.generate(5_000).unwrap()) {
            let slot = &mut last[update.instrument as usize];
            if let Some(prev) = *slot {
                let change = (f64::from(update.price_cents) / f64::from(prev) - 1.0).abs();
                assert!(change < 0.01);
            }
            *slot = Some(update.price_cents);
        }
    }

    #[test]
    fn imbalance_handles_empty_book() {
        assert_eq!(imbalance(0, 0), 0.0);
        assert_eq!(imbalance(600, 400), 0.2);
        assert_eq!(imbalance(0, 10), -1.0);
    }

    #[test]
    fn packed_layout_round_trips() {
        let update = MarketUpdate {
            instrument: 3,
            price_cents: 10_200,
            trade_quantity: 30,
            bid_cents: 10_196,
            ask_cents: 10_200,
            bid_quantity: 600,
            ask_quantity: 400,
        };
        let mut packed = Vec::new();
        update.write_to(&mut packed);
        assert_eq!(packed, [3, 10_200, 30, 10_196, 10_200, 600, 400]);
        assert_eq!(MarketUpdate::read_from(&packed), update);
    }
}
