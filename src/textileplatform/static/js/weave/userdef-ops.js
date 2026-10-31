// Stored user-defined patterns (the "Additional" menu), behind the
// dialogs in userdef.js.
//
//   parseUserdefSlots(raw)                          -> 10 slots (or null)
//   encodeUserdefRect(weave, i1, i2, j1, j2)        -> data string
//   isUsableUserdef(slot)
//   stampUserdef(weave, slot, x, y, transparent)    -> inserted block
//
// A slot is { description, sizex, sizey, data }. data is the desktop's
// k-alphabet, column by column: cell value s > 0 -> char('k' + s),
// anything else -> 'k'. No DOM, no editor globals; port of userdef.cpp.

export const USERDEF_SLOTS = 10;
const USERDEF_K_CHAR = 107; // 'k'

// The stored slot list (JSON text, or null when nothing is stored):
// always USERDEF_SLOTS entries, unusable ones null.
export function parseUserdefSlots(raw) {
    try {
        if (!raw) return new Array(USERDEF_SLOTS).fill(null);
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Array(USERDEF_SLOTS).fill(null);
        const out = [];
        for (let i = 0; i < USERDEF_SLOTS; i++) {
            const s = parsed[i];
            out.push((s && s.data && s.sizex && s.sizey)
                ? { description: s.description || "", sizex: s.sizex|0, sizey: s.sizey|0, data: s.data }
                : null);
        }
        return out;
    } catch { return new Array(USERDEF_SLOTS).fill(null); }
}

// k-alphabet encoding of the weave cells i1..i2 x j1..j2.
export function encodeUserdefRect(weave, i1, i2, j1, j2) {
    let out = "";
    for (let i = i1; i <= i2; i++) {
        for (let j = j1; j <= j2; j++) {
            const s = weave.get(i, j);
            const c = s > 0 ? (USERDEF_K_CHAR + s) : USERDEF_K_CHAR;
            out += String.fromCharCode(c);
        }
    }
    return out;
}

// A slot can be inserted when it has data for all its cells.
export function isUsableUserdef(slot) {
    if (!slot || !slot.data) return false;
    return slot.data.length >= slot.sizex * slot.sizey;
}

// Stamp the slot with its lower left corner at (x, y), clipped to the
// weave. Transparent: unset cells of the slot leave the weave alone,
// otherwise they clear it. Returns the inserted block { x1, y1, x2, y2 }.
export function stampUserdef(weave, slot, x, y, transparent) {
    let xx = x + slot.sizex; let yy = y + slot.sizey;
    if (xx > weave.width)  xx = weave.width;
    if (yy > weave.height) yy = weave.height;
    for (let i = x; i < xx; i++) {
        for (let j = y; j < yy; j++) {
            const idx2 = (i - x) * slot.sizey + (j - y);
            if (idx2 >= slot.data.length) continue;
            const code = slot.data.charCodeAt(idx2);
            const s = code - USERDEF_K_CHAR;
            if (s !== 0) {
                weave.set(i, j, s);
            } else if (!transparent) {
                weave.set(i, j, 0);
            }
        }
    }
    return { x1: x, y1: y, x2: Math.max(x, xx - 1), y2: Math.max(y, yy - 1) };
}
