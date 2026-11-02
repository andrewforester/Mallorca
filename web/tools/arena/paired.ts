export interface Paired {
  pairs: number;
  mean: number;
  ci95: number;
}

interface HandLike {
  handNumber: number;
  events: Array<{ type: string; stacks?: [number, number] }>;
}

function stacksOf(record: HandLike, type: string): [number, number] {
  const stacks = record.events.find((event) => event.type === type)?.stacks;
  if (stacks === undefined) {
    throw new Error(`hand ${record.handNumber} has no ${type} stacks`);
  }
  return stacks;
}

export function netsOfRecords(records: HandLike[]): Map<number, number> {
  const nets = new Map<number, number>();
  for (const record of records) {
    const index = (record.handNumber - 1) >> 1;
    const seat = ((record.handNumber - 1) & 1) as 0 | 1;
    const net = stacksOf(record, 'handEnded')[seat] - stacksOf(record, 'handStarted')[seat];
    nets.set(index, (nets.get(index) ?? 0) + net);
  }
  return nets;
}

export function pairedDifference(
  a: Map<number, number>,
  b: Map<number, number>,
  bigBlind: number,
): Paired {
  if (a.size !== b.size) {
    throw new Error(`the runs have ${a.size} and ${b.size} pairs`);
  }
  const differences = [...a].map(([index, net]) => {
    const other = b.get(index);
    if (other === undefined) {
      throw new Error(`pair ${index} is missing from the second run`);
    }
    return ((other - net) / 2 / bigBlind) * 100;
  });
  const n = differences.length;
  const mean = differences.reduce((sum, d) => sum + d, 0) / n;
  const variance = differences.reduce((sum, d) => sum + (d - mean) ** 2, 0) / (n - 1);
  return { pairs: n, mean, ci95: (1.96 * Math.sqrt(variance)) / Math.sqrt(n) };
}
