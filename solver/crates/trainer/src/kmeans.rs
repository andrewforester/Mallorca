use crate::parallel::map_chunks_mut;
use mallorca_core::potential::{emd, l2, nearest, Metric};
use mallorca_core::rng::Rng;

const CHUNK: usize = 4096;
const MAX_ITERATIONS: usize = 100;
const MAX_CLUSTERS: usize = 256;

struct Data<'a> {
    points: &'a [f32],
    dimension: usize,
    weights: &'a [u32],
    metric: Metric,
    threads: usize,
}

impl Data<'_> {
    fn len(&self) -> usize {
        self.weights.len()
    }

    fn point(&self, i: usize) -> &[f32] {
        &self.points[i * self.dimension..(i + 1) * self.dimension]
    }

    fn weight(&self, i: usize) -> f64 {
        self.weights[i] as f64
    }

    fn distance(&self, a: &[f32], b: &[f32]) -> f32 {
        match self.metric {
            Metric::Emd => emd(a, b),
            Metric::L2 => l2(a, b),
        }
    }
}

#[derive(Clone, Copy)]
struct Cell {
    label: u8,
    distance: f32,
}

struct Partial {
    changes: usize,
    sums: Vec<f64>,
    totals: Vec<f64>,
}

pub fn kmeans(
    points: &[f32],
    dimension: usize,
    weights: &[u32],
    k: usize,
    metric: Metric,
    seed: u64,
    threads: usize,
) -> Vec<f32> {
    assert!(dimension > 0, "dimension must be positive");
    assert_eq!(
        points.len(),
        weights.len() * dimension,
        "points and weights disagree"
    );
    assert!(!weights.is_empty(), "k-means needs at least one point");
    assert!((1..=MAX_CLUSTERS).contains(&k), "k must be in 1..=256");
    let data = Data {
        points,
        dimension,
        weights,
        metric,
        threads,
    };
    let mut centroids = seed_centroids(&data, k, &mut Rng::new(seed));
    lloyd(&data, &mut centroids, k);
    sort_by_equity(&centroids, dimension, metric)
}

pub fn assign(
    points: &[f32],
    dimension: usize,
    centroids: &[f32],
    metric: Metric,
    threads: usize,
) -> Vec<u8> {
    assert!(dimension > 0, "dimension must be positive");
    assert!(
        centroids.len() <= MAX_CLUSTERS * dimension,
        "at most 256 centroids"
    );
    let mut labels = vec![0u8; points.len() / dimension];
    map_chunks_mut(&mut labels, CHUNK, threads, |chunk, slice| {
        for (j, label) in slice.iter_mut().enumerate() {
            let i = chunk * CHUNK + j;
            let point = &points[i * dimension..(i + 1) * dimension];
            *label = nearest(metric, centroids, dimension, point) as u8;
        }
    });
    labels
}

fn seed_centroids(data: &Data, k: usize, rng: &mut Rng) -> Vec<f32> {
    let mut centroids = Vec::with_capacity(k * data.dimension);
    let mut distances = vec![f32::INFINITY; data.len()];
    let mut sums: Vec<f64> = (0..data.len())
        .step_by(CHUNK)
        .map(|from| {
            (from..(from + CHUNK).min(data.len()))
                .map(|i| data.weight(i))
                .sum()
        })
        .collect();
    for chosen in 0..k {
        let value = |i: usize| match chosen {
            0 => data.weight(i),
            _ => data.weight(i) * distances[i] as f64,
        };
        let Some(i) = pick(rng, &sums, data.len(), value) else {
            break;
        };
        centroids.extend_from_slice(data.point(i));
        sums = update_distances(data, &mut distances, data.point(i));
    }
    let mut m = 0;
    while centroids.len() < k * data.dimension {
        centroids.extend_from_slice(data.point(m % data.len()));
        m += 1;
    }
    centroids
}

fn update_distances(data: &Data, distances: &mut [f32], centre: &[f32]) -> Vec<f64> {
    map_chunks_mut(distances, CHUNK, data.threads, |chunk, slice| {
        let mut sum = 0.0f64;
        for (j, d) in slice.iter_mut().enumerate() {
            let i = chunk * CHUNK + j;
            *d = d.min(data.distance(centre, data.point(i)));
            sum += data.weight(i) * *d as f64;
        }
        sum
    })
}

fn pick(rng: &mut Rng, sums: &[f64], len: usize, value: impl Fn(usize) -> f64) -> Option<usize> {
    let total: f64 = sums.iter().sum();
    if total <= 0.0 {
        return None;
    }
    let mut target = rng.next_f64() * total;
    let mut last = None;
    for (chunk, &sum) in sums.iter().enumerate() {
        if sum <= 0.0 {
            continue;
        }
        for i in chunk * CHUNK..((chunk + 1) * CHUNK).min(len) {
            let v = value(i);
            if v <= 0.0 {
                continue;
            }
            if target < v {
                return Some(i);
            }
            target -= v;
            last = Some(i);
        }
    }
    last
}

fn lloyd(data: &Data, centroids: &mut [f32], k: usize) {
    let mut cells = vec![
        Cell {
            label: 0,
            distance: 0.0
        };
        data.len()
    ];
    for iteration in 0..MAX_ITERATIONS {
        let (changes, sums, totals) = assign_cells(data, centroids, k, &mut cells);
        if iteration > 0 && changes == 0 {
            break;
        }
        update_centroids(data, centroids, &sums, &totals, &mut cells);
    }
}

fn assign_cells(
    data: &Data,
    centroids: &[f32],
    k: usize,
    cells: &mut [Cell],
) -> (usize, Vec<f64>, Vec<f64>) {
    let partials = map_chunks_mut(cells, CHUNK, data.threads, |chunk, slice| {
        assign_chunk(data, centroids, k, chunk, slice)
    });
    let mut changes = 0;
    let mut sums = vec![0.0f64; k * data.dimension];
    let mut totals = vec![0.0f64; k];
    for partial in partials {
        changes += partial.changes;
        for (s, p) in sums.iter_mut().zip(&partial.sums) {
            *s += p;
        }
        for (t, p) in totals.iter_mut().zip(&partial.totals) {
            *t += p;
        }
    }
    (changes, sums, totals)
}

fn assign_chunk(
    data: &Data,
    centroids: &[f32],
    k: usize,
    chunk: usize,
    cells: &mut [Cell],
) -> Partial {
    let dimension = data.dimension;
    let mut partial = Partial {
        changes: 0,
        sums: vec![0.0f64; k * dimension],
        totals: vec![0.0f64; k],
    };
    for (j, cell) in cells.iter_mut().enumerate() {
        let i = chunk * CHUNK + j;
        let point = data.point(i);
        let label = nearest(data.metric, centroids, dimension, point) as usize;
        let centroid = &centroids[label * dimension..(label + 1) * dimension];
        if cell.label as usize != label {
            partial.changes += 1;
        }
        *cell = Cell {
            label: label as u8,
            distance: data.distance(centroid, point),
        };
        let w = data.weight(i);
        partial.totals[label] += w;
        for (s, &x) in partial.sums[label * dimension..].iter_mut().zip(point) {
            *s += w * x as f64;
        }
    }
    partial
}

fn update_centroids(
    data: &Data,
    centroids: &mut [f32],
    sums: &[f64],
    totals: &[f64],
    cells: &mut [Cell],
) {
    let dimension = data.dimension;
    for (c, &total) in totals.iter().enumerate() {
        let centroid = &mut centroids[c * dimension..(c + 1) * dimension];
        if total > 0.0 {
            for (x, &s) in centroid.iter_mut().zip(&sums[c * dimension..]) {
                *x = (s / total) as f32;
            }
        } else if let Some(i) = farthest(cells) {
            centroid.copy_from_slice(data.point(i));
            cells[i].distance = 0.0;
        }
    }
}

fn farthest(cells: &[Cell]) -> Option<usize> {
    let mut best = None;
    let mut best_distance = 0.0f32;
    for (i, cell) in cells.iter().enumerate() {
        if cell.distance > best_distance {
            best = Some(i);
            best_distance = cell.distance;
        }
    }
    best
}

fn mean_equity(centroid: &[f32], metric: Metric) -> f64 {
    let n = centroid.len() as f64;
    match metric {
        Metric::Emd => centroid
            .iter()
            .enumerate()
            .map(|(i, &p)| p as f64 * (i as f64 + 0.5) / n)
            .sum(),
        Metric::L2 => centroid.iter().map(|&x| x as f64).sum::<f64>() / n,
    }
}

fn sort_by_equity(centroids: &[f32], dimension: usize, metric: Metric) -> Vec<f32> {
    let keys: Vec<f64> = centroids
        .chunks_exact(dimension)
        .map(|c| mean_equity(c, metric))
        .collect();
    let mut order: Vec<usize> = (0..keys.len()).collect();
    order.sort_by(|&a, &b| keys[a].total_cmp(&keys[b]));
    order
        .into_iter()
        .flat_map(|c| {
            centroids[c * dimension..(c + 1) * dimension]
                .iter()
                .copied()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use mallorca_core::potential::BINS;
    use mallorca_core::rng::Rng;

    fn random_histograms(n: usize, seed: u64) -> (Vec<f32>, Vec<u32>) {
        let mut rng = Rng::new(seed);
        let mut points = Vec::with_capacity(n * BINS);
        let mut weights = Vec::with_capacity(n);
        for _ in 0..n {
            let mut counts = [0u32; BINS];
            let centre = rng.below(BINS as u32) as i32;
            for _ in 0..20 {
                let offset = rng.below(9) as i32 - 4;
                counts[(centre + offset).clamp(0, BINS as i32 - 1) as usize] += 1;
            }
            points.extend(counts.iter().map(|&c| c as f32 / 20.0));
            weights.push(1 + rng.below(12));
        }
        (points, weights)
    }

    fn equity(centroid: &[f32]) -> f64 {
        centroid
            .iter()
            .enumerate()
            .map(|(i, &p)| p as f64 * (i as f64 + 0.5) / centroid.len() as f64)
            .sum()
    }

    fn assert_valid_histograms(centroids: &[f32], k: usize) {
        assert_eq!(centroids.len(), k * BINS);
        for c in centroids.as_chunks::<BINS>().0 {
            assert!(c.iter().all(|v| v.is_finite() && *v >= 0.0));
            let sum: f64 = c.iter().map(|&v| v as f64).sum();
            assert!((sum - 1.0).abs() < 1e-5, "centroid sums to {sum}");
        }
        let equities: Vec<f64> = centroids
            .as_chunks::<BINS>()
            .0
            .iter()
            .map(|c| equity(c))
            .collect();
        assert!(equities.windows(2).all(|w| w[0] <= w[1]), "{equities:?}");
    }

    #[test]
    fn recovers_separated_clusters() {
        let spikes = [[0.9f32, 0.8], [0.1, 0.2], [0.5, 0.5]];
        let mut points = Vec::new();
        for spike in spikes {
            for _ in 0..100 {
                points.extend_from_slice(&spike);
            }
        }
        let weights = vec![1u32; 300];
        let centroids = kmeans(&points, 2, &weights, 3, Metric::L2, 7, 2);
        let expected = [0.1f32, 0.2, 0.5, 0.5, 0.9, 0.8];
        assert_eq!(centroids.len(), 6);
        for (got, want) in centroids.iter().zip(expected) {
            assert!((got - want).abs() < 1e-6, "{centroids:?}");
        }
        let labels = assign(&points, 2, &centroids, Metric::L2, 2);
        assert_eq!(labels[0], 2);
        assert_eq!(labels[100], 0);
        assert_eq!(labels[299], 1);
    }

    #[test]
    fn same_seed_same_centroids() {
        let (points, weights) = random_histograms(1500, 1);
        let a = kmeans(&points, BINS, &weights, 8, Metric::Emd, 42, 3);
        let b = kmeans(&points, BINS, &weights, 8, Metric::Emd, 42, 3);
        assert_eq!(a, b);
    }

    #[test]
    fn different_seed_may_differ_but_is_valid() {
        let (points, weights) = random_histograms(1500, 2);
        for seed in [1, 2] {
            let centroids = kmeans(&points, BINS, &weights, 8, Metric::Emd, seed, 2);
            assert_valid_histograms(&centroids, 8);
            let labels = assign(&points, BINS, &centroids, Metric::Emd, 2);
            assert_eq!(labels.len(), 1500);
            assert!(labels.iter().all(|&l| l < 8));
        }
    }

    #[test]
    fn same_result_for_one_and_four_threads() {
        let (points, weights) = random_histograms(20_000, 3);
        let one = kmeans(&points, BINS, &weights, 8, Metric::Emd, 5, 1);
        let four = kmeans(&points, BINS, &weights, 8, Metric::Emd, 5, 4);
        assert_eq!(one, four);
        assert_eq!(
            assign(&points, BINS, &one, Metric::Emd, 1),
            assign(&points, BINS, &one, Metric::Emd, 4)
        );
    }

    #[test]
    fn fewer_points_than_clusters() {
        let distinct = [[0.0f32, 1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]];
        let mut points = Vec::new();
        for i in 0..12 {
            points.extend_from_slice(&distinct[i % 3]);
        }
        let weights = vec![2u32; 12];
        for metric in [Metric::Emd, Metric::L2] {
            let centroids = kmeans(&points, 3, &weights, 8, metric, 9, 4);
            assert_eq!(centroids.len(), 8 * 3);
            assert!(centroids.iter().all(|v| v.is_finite()));
            let labels = assign(&points, 3, &centroids, metric, 4);
            assert!(labels.iter().all(|&l| l < 8));
            assert_ne!(labels[0], labels[1]);
            assert_ne!(labels[1], labels[2]);
            assert_ne!(labels[0], labels[2]);
        }
    }

    #[test]
    fn weights_pull_the_mean() {
        let centroids = kmeans(&[0.0, 1.0], 1, &[1, 3], 1, Metric::L2, 1, 1);
        assert_eq!(centroids, vec![0.75]);
    }

    #[test]
    fn emd_centroids_are_histograms() {
        let (points, weights) = random_histograms(3000, 4);
        let centroids = kmeans(&points, BINS, &weights, 16, Metric::Emd, 11, 4);
        assert_valid_histograms(&centroids, 16);
    }

    #[test]
    fn sorts_l2_centroids_by_the_mean_of_coordinates() {
        let points = [0.9f32, 0.9, 0.0, 0.4, 0.3, 0.3];
        let centroids = kmeans(&points, 2, &[1, 1, 1], 3, Metric::L2, 3, 1);
        assert_eq!(centroids, vec![0.0, 0.4, 0.3, 0.3, 0.9, 0.9]);
    }
}
