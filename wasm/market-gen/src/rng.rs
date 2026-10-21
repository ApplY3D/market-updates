//! Small, dependency-free PRNG. SplitMix64 is fast, has a full 2^64 period and
//! is good enough for simulation; it is not cryptographically secure.

#[derive(Debug, Clone)]
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in `[0, 1)` with 53 bits of precision.
    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    /// Uniform in `[0, n)` without modulo bias (Lemire's method). `n` must be > 0.
    pub fn below(&mut self, n: u32) -> u32 {
        debug_assert!(n > 0);
        let n = u64::from(n);
        loop {
            let m = (self.next_u64() >> 32) * n;
            let low = m & 0xFFFF_FFFF;
            if low >= (1u64 << 32) % n {
                return (m >> 32) as u32;
            }
        }
    }

    /// Uniform in `[lo, hi]`.
    pub fn between(&mut self, lo: u32, hi: u32) -> u32 {
        debug_assert!(lo <= hi);
        lo + self.below(hi - lo + 1)
    }

    pub fn chance(&mut self, p: f64) -> bool {
        self.next_f64() < p
    }

    /// Standard normal sample (Box–Muller).
    pub fn normal(&mut self) -> f64 {
        let u1 = 1.0 - self.next_f64(); // (0, 1], avoids ln(0)
        let u2 = self.next_f64();
        (-2.0 * u1.ln()).sqrt() * (core::f64::consts::TAU * u2).cos()
    }

    /// Exponential sample with the given mean.
    pub fn exponential(&mut self, mean: f64) -> f64 {
        -(1.0 - self.next_f64()).ln() * mean
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_gives_same_sequence() {
        let mut a = Rng::new(42);
        let mut b = Rng::new(42);
        for _ in 0..1_000 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn different_seeds_diverge() {
        let mut a = Rng::new(1);
        let mut b = Rng::new(2);
        assert!((0..10).any(|_| a.next_u64() != b.next_u64()));
    }

    #[test]
    fn next_f64_is_in_unit_interval() {
        let mut rng = Rng::new(7);
        for _ in 0..100_000 {
            let x = rng.next_f64();
            assert!((0.0..1.0).contains(&x));
        }
    }

    #[test]
    fn below_stays_in_range_and_covers_it() {
        let mut rng = Rng::new(7);
        let mut seen = [false; 5];
        for _ in 0..10_000 {
            let x = rng.below(5);
            assert!(x < 5);
            seen[x as usize] = true;
        }
        assert!(seen.iter().all(|&s| s));
        assert_eq!(rng.below(1), 0);
    }

    #[test]
    fn between_is_inclusive() {
        let mut rng = Rng::new(3);
        let values: Vec<u32> = (0..10_000).map(|_| rng.between(10, 12)).collect();
        assert!(values.iter().all(|v| (10..=12).contains(v)));
        assert!(values.contains(&10) && values.contains(&12));
    }

    #[test]
    fn normal_has_roughly_zero_mean_and_unit_variance() {
        let mut rng = Rng::new(11);
        let n = 200_000;
        let samples: Vec<f64> = (0..n).map(|_| rng.normal()).collect();
        let mean = samples.iter().sum::<f64>() / n as f64;
        let var = samples.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n as f64;
        assert!(mean.abs() < 0.02, "mean {mean}");
        assert!((var - 1.0).abs() < 0.02, "variance {var}");
    }
}
