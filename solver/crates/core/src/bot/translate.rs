pub fn pseudo_harmonic(a: f64, b: f64, x: f64) -> f64 {
    if b <= a {
        return 1.0;
    }
    (((b - x) * (1.0 + a)) / ((b - a) * (1.0 + x))).clamp(0.0, 1.0)
}

pub fn nearest(sizes: &[f64], x: f64, draw: f64) -> usize {
    let last = sizes.len() - 1;
    if x <= sizes[0] {
        return 0;
    }
    if x >= sizes[last] {
        return last;
    }
    let i = sizes.partition_point(|&s| s <= x) - 1;
    if draw < pseudo_harmonic(sizes[i], sizes[i + 1], x) {
        i
    } else {
        i + 1
    }
}

pub fn sample(probabilities: &[u8], draw: f64) -> usize {
    let mut r = ((draw * 255.0) as u32).min(254);
    for (i, &p) in probabilities.iter().enumerate() {
        let p = u32::from(p);
        if r < p {
            return i;
        }
        r -= p;
    }
    probabilities
        .iter()
        .rposition(|&p| p > 0)
        .unwrap_or(probabilities.len() - 1)
}

pub fn sample_f32(probabilities: &[f32], draw: f64) -> usize {
    let total: f64 = probabilities.iter().map(|&p| f64::from(p.max(0.0))).sum();
    let target = draw * total;
    let mut acc = 0.0;
    for (i, &p) in probabilities.iter().enumerate() {
        let p = f64::from(p.max(0.0));
        acc += p;
        if p > 0.0 && target < acc {
            return i;
        }
    }
    probabilities
        .iter()
        .rposition(|&p| p > 0.0)
        .unwrap_or(probabilities.len().saturating_sub(1))
}

pub fn fraction(to: u32, opp_bet: u32, pot_after_call: u32) -> f64 {
    if pot_after_call == 0 {
        return 0.0;
    }
    (f64::from(to) - f64::from(opp_bet)) / f64::from(pot_after_call)
}

pub fn scaled_raise(fraction: f64, opp_bet: u32, pot_after_call: u32, range: (u32, u32)) -> u32 {
    let to = f64::from(opp_bet) + fraction * f64::from(pot_after_call);
    (to.round().max(0.0) as u32).clamp(range.0, range.1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pseudo_harmonic_is_one_at_a_and_zero_at_b() {
        assert_eq!(pseudo_harmonic(0.5, 1.0, 0.5), 1.0);
        assert_eq!(pseudo_harmonic(0.5, 1.0, 1.0), 0.0);
        let p = pseudo_harmonic(0.5, 1.0, 0.75);
        assert!((p - 0.375 / 0.875).abs() < 1e-12, "{p}");
        let mut last = 1.0;
        for i in 0..=100 {
            let p = pseudo_harmonic(0.5, 2.0, 0.5 + 1.5 * f64::from(i) / 100.0);
            assert!(p <= last);
            last = p;
        }
    }

    #[test]
    fn nearest_clamps_outside_and_splits_inside() {
        let sizes = [0.5, 1.0, 3.0];
        assert_eq!(nearest(&sizes, 0.1, 0.99), 0);
        assert_eq!(nearest(&sizes, 9.0, 0.0), 2);
        assert_eq!(nearest(&sizes, 1.0, 0.99), 1);
        let p = pseudo_harmonic(1.0, 3.0, 2.0);
        assert_eq!(nearest(&sizes, 2.0, p - 1e-9), 1);
        assert_eq!(nearest(&sizes, 2.0, p + 1e-9), 2);
    }

    #[test]
    fn nearest_frequency_follows_the_mapping() {
        let sizes = [0.5, 1.0];
        let x = 0.7;
        let picks = (0..10_000)
            .filter(|i| nearest(&sizes, x, f64::from(*i) / 10_000.0) == 0)
            .count();
        let expected = pseudo_harmonic(0.5, 1.0, x) * 10_000.0;
        assert!(
            (picks as f64 - expected).abs() <= 1.0,
            "{picks} vs {expected}"
        );
    }

    #[test]
    fn sample_walks_the_cumulative_bytes() {
        let p = [0u8, 100, 0, 155];
        assert_eq!(sample(&p, 0.0), 1);
        assert_eq!(sample(&p, 99.0 / 255.0), 1);
        assert_eq!(sample(&p, 100.0 / 255.0), 3);
        assert_eq!(sample(&p, 0.999_999), 3);
        assert_eq!(sample(&[255], 0.5), 0);
    }

    #[test]
    fn raise_keeps_the_pot_fraction() {
        let to = scaled_raise(0.75, 100, 200, (150, 5000));
        assert_eq!(to, 250);
        assert_eq!(scaled_raise(0.75, 100, 200, (300, 5000)), 300);
        assert_eq!(scaled_raise(9.0, 100, 200, (150, 1000)), 1000);
    }

    #[test]
    fn sample_f32_walks_the_cumulative_probabilities() {
        let p = [0.25, 0.0, 0.5, 0.25];
        assert_eq!(sample_f32(&p, 0.0), 0);
        assert_eq!(sample_f32(&p, 0.24), 0);
        assert_eq!(sample_f32(&p, 0.25), 2);
        assert_eq!(sample_f32(&p, 0.8), 3);
        assert_eq!(sample_f32(&p, 1.0), 3);
        assert_eq!(sample_f32(&[0.5, 0.5, 0.0], 1.0), 1);
        assert_eq!(sample_f32(&[0.0, 0.0], 0.5), 1);
    }

    #[test]
    fn fraction_of_a_raise() {
        assert!((fraction(50, 20, 40) - 0.75).abs() < 1e-12);
        assert_eq!(fraction(20, 20, 0), 0.0);
    }
}
