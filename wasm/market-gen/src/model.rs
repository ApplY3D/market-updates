use core::fmt;

use crate::rng::Rng;

/// Packed layout: `[instrument, priceCents, tradeQuantity, bidCents, askCents, bidQuantity, askQuantity]`.
pub const UPDATE_STRIDE: usize = 7;
const MAX_INSTRUMENTS: u32 = 1_000;
const MAX_BATCH_SIZE: u32 = 100_000;

const MIN_MID_CENTS: f64 = 100.0;
const MAX_MID_CENTS: f64 = 10_000_000.0;
/// Per-update standard deviation of the mid as a fraction of price.
const VOLATILITY: f64 = 0.0005;
/// Mid drift per unit of book imbalance, in standard deviations.
const IMBALANCE_DRIFT: f64 = 0.3;
const SIDE_BIAS: f64 = 0.15;
const SPREAD_FRACTION: f64 = 0.0002;
const BOOK_MEAN: f64 = 500.0;
const BOOK_REVERSION: f64 = 0.2;
const BOOK_NOISE: f64 = 50.0;
const MAX_BOOK_QUANTITY: f64 = 100_000.0;
const TRADE_QUANTITY_MEAN: f64 = 40.0;
const MAX_TRADE_QUANTITY: f64 = 1_000.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct MarketUpdate {
    instrument: u32,
    price_cents: u32,
    trade_quantity: u32,
    bid_cents: u32,
    ask_cents: u32,
    bid_quantity: u32,
    ask_quantity: u32,
}

impl MarketUpdate {
    fn to_fields(self) -> [u32; UPDATE_STRIDE] {
        [
            self.instrument,
            self.price_cents,
            self.trade_quantity,
            self.bid_cents,
            self.ask_cents,
            self.bid_quantity,
            self.ask_quantity,
        ]
    }

    #[cfg(test)]
    fn from_fields(f: &[u32]) -> Self {
        Self {
            instrument: f[0],
            price_cents: f[1],
            trade_quantity: f[2],
            bid_cents: f[3],
            ask_cents: f[4],
            bid_quantity: f[5],
            ask_quantity: f[6],
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
            Self::InstrumentCount(n) => write!(f, "instrument count {n} not in 1..={MAX_INSTRUMENTS}"),
            Self::BatchSize(n) => write!(f, "batch size {n} not in 1..={MAX_BATCH_SIZE}"),
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

    pub fn generate(&mut self, batch_size: u32) -> Result<Vec<u32>, ConfigError> {
        if !(1..=MAX_BATCH_SIZE).contains(&batch_size) {
            return Err(ConfigError::BatchSize(batch_size));
        }
        Ok((0..batch_size).flat_map(|_| self.next_update().to_fields()).collect())
    }

    fn next_update(&mut self) -> MarketUpdate {
        let instrument = self.rng.below(self.instruments.len() as u32);
        step(&mut self.rng, &mut self.instruments[instrument as usize], instrument)
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

    let trade_quantity = (1.0 + rng.exponential(TRADE_QUANTITY_MEAN)).min(MAX_TRADE_QUANTITY) as u32;
    let (price_cents, taken_side) = if rng.chance(0.5 + SIDE_BIAS * pressure) {
        (ask_cents, &mut state.ask_quantity)
    } else {
        (bid_cents, &mut state.bid_quantity)
    };
    *taken_side = taken_side.saturating_sub(trade_quantity);

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
    let (bid, ask) = (f64::from(bid_quantity), f64::from(ask_quantity));
    if bid + ask == 0.0 { 0.0 } else { (bid - ask) / (bid + ask) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generator(seed: u64, count: u32) -> MarketGenerator {
        MarketGenerator::new(seed, count).unwrap()
    }

    fn decode(packed: &[u32]) -> Vec<MarketUpdate> {
        assert_eq!(packed.len() % UPDATE_STRIDE, 0);
        packed.chunks_exact(UPDATE_STRIDE).map(MarketUpdate::from_fields).collect()
    }

    fn relative_change(from: u32, to: u32) -> f64 {
        (f64::from(to) / f64::from(from) - 1.0).abs()
    }

    #[test]
    fn rejects_invalid_config() {
        assert_eq!(MarketGenerator::new(1, 0).unwrap_err(), ConfigError::InstrumentCount(0));
        assert!(MarketGenerator::new(1, MAX_INSTRUMENTS + 1).is_err());
        assert!(MarketGenerator::new(1, MAX_INSTRUMENTS).is_ok());
        assert_eq!(generator(1, 5).generate(0).unwrap_err(), ConfigError::BatchSize(0));
        assert!(generator(1, 5).generate(MAX_BATCH_SIZE + 1).is_err());
    }

    #[test]
    fn returns_exactly_the_requested_batch_size() {
        let mut g = generator(1, 5);
        for size in [1, 2, 7, 100, 1_000] {
            assert_eq!(g.generate(size).unwrap().len(), size as usize * UPDATE_STRIDE);
        }
    }

    #[test]
    fn generated_values_satisfy_invariants() {
        for (seed, count) in [(1, 1), (2, 5), (3, 50), (0xDEAD_BEEF, 17)] {
            let mut g = generator(seed, count);
            for u in (0..50).flat_map(|_| decode(&g.generate(1_000).unwrap())) {
                assert!(u.instrument < count, "{u:?}");
                assert!(u.bid_cents > 0 && u.bid_cents < u.ask_cents, "{u:?}");
                assert!(u.price_cents == u.bid_cents || u.price_cents == u.ask_cents, "{u:?}");
                assert!(u.trade_quantity >= 1, "{u:?}");
            }
        }
    }

    #[test]
    fn same_seed_is_deterministic_and_different_seeds_diverge() {
        assert_eq!(generator(9, 10).generate(500), generator(9, 10).generate(500));
        assert_ne!(generator(1, 10).generate(100), generator(2, 10).generate(100));
    }

    #[test]
    fn every_instrument_is_selected_and_repeats_within_a_batch() {
        let mut counts = [0u32; 10];
        decode(&generator(5, 10).generate(1_000).unwrap())
            .iter()
            .for_each(|u| counts[u.instrument as usize] += 1);
        assert!(counts.iter().all(|&c| c > 1), "{counts:?}");
    }

    #[test]
    fn trades_happen_on_both_sides_of_the_quote() {
        let updates = decode(&generator(8, 3).generate(1_000).unwrap());
        assert!(updates.iter().any(|u| u.price_cents == u.bid_cents));
        assert!(updates.iter().any(|u| u.price_cents == u.ask_cents));
    }

    #[test]
    fn each_instrument_price_evolves_from_its_previous_value_across_calls() {
        let mut g = generator(21, 3);
        let mut last = [None::<u32>; 3];
        let mut distinct = std::collections::HashSet::new();
        for u in (0..2_000).flat_map(|_| decode(&g.generate(5).unwrap())) {
            if let Some(prev) = last[u.instrument as usize] {
                assert!(relative_change(prev, u.price_cents) < 0.01, "{prev} -> {u:?}");
            }
            last[u.instrument as usize] = Some(u.price_cents);
            distinct.insert(u.price_cents);
        }
        assert!(distinct.len() > 50, "price barely moves");
    }

    #[test]
    fn book_sides_rarely_run_empty() {
        let updates = decode(&generator(42, 50).generate(100_000).unwrap());
        let empty = updates.iter().filter(|u| u.bid_quantity == 0 || u.ask_quantity == 0).count();
        assert!(empty < updates.len() / 100, "{empty} of {} updates have an empty side", updates.len());
    }

    #[test]
    fn imbalance_handles_empty_book() {
        assert_eq!(imbalance(0, 0), 0.0);
        assert_eq!(imbalance(600, 400), 0.2);
        assert_eq!(imbalance(0, 10), -1.0);
    }

    #[test]
    fn packed_layout_round_trips() {
        let fields = [3, 10_200, 30, 10_196, 10_200, 600, 400];
        assert_eq!(MarketUpdate::from_fields(&fields).to_fields(), fields);
        assert_eq!(MarketUpdate::from_fields(&fields).bid_cents, 10_196);
    }
}
