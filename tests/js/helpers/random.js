// Deterministic pseudo-random numbers for tests (mulberry32). A plain
// `seed % n` LCG is not good enough: its low bits repeat with a short
// period, so "random" patterns come out nearly identical.

export function randomSource(seed) {
    let a = seed >>> 0;
    const next = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Integer in 0 .. n-1.
    return (n) => Math.floor(next() * n);
}
