import {histogram} from './histogram';

describe('histogram', () => {
  it('uses round class widths with a border at zero', () => {
    const result = histogram([-120, -5, 0, 40, 380], [1, 1, 1, 2, 1], 10);

    expect(result.width).toBe(50);
    expect(result.start).toBe(-150);
    expect(result.counts.length).toBe(11);
    expect(result.counts[0]).toBe(1); // −120 in [−150, −100)
    expect(result.counts[2]).toBe(1); // −5 in [−50, 0)
    expect(result.counts[3]).toBe(3); // 0 und zweimal 40 in [0, 50)
    expect(result.counts[10]).toBe(1); // 380 in [350, 400)
    expect(result.counts.reduce((a, b) => a + b, 0)).toBe(6);
  });

  it('handles a single value', () => {
    expect(histogram([7, 7], [1, 1]).counts).toEqual([2]);
  });
});
