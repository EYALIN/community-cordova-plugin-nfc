'use strict';
// A byte-accurate NXP Type 2 tag behind the fake cordova bridge: GET_VERSION, READ (16 bytes with
// roll-over past the last page, exactly like the silicon), WRITE, PWD_AUTH, READ_SIG, READ_CNT,
// AUTH0/PROT access control, and the "a NAK halts the tag until it is re-selected" rule.
// Memory maps from the NXP datasheets (NTAG213/215/216, NTAG210/212, MIFARE Ultralight EV1).

const ICS = {
    NTAG210: { version: [0x00, 0x04, 0x04, 0x01, 0x01, 0x00, 0x0B, 0x03], pages: 20, cfg: 0x10 },
    NTAG212: { version: [0x00, 0x04, 0x04, 0x01, 0x01, 0x00, 0x0E, 0x03], pages: 41, cfg: 0x25 },
    NTAG213: { version: [0x00, 0x04, 0x04, 0x02, 0x01, 0x00, 0x0F, 0x03], pages: 45, cfg: 0x29 },
    NTAG215: { version: [0x00, 0x04, 0x04, 0x02, 0x01, 0x00, 0x11, 0x03], pages: 135, cfg: 0x83 },
    NTAG216: { version: [0x00, 0x04, 0x04, 0x02, 0x01, 0x00, 0x13, 0x03], pages: 231, cfg: 0xE3 },
    MF0UL11: { version: [0x00, 0x04, 0x03, 0x01, 0x01, 0x00, 0x0B, 0x03], pages: 20, cfg: 0x10 },
    MF0UL21: { version: [0x00, 0x04, 0x03, 0x01, 0x01, 0x00, 0x0E, 0x03], pages: 41, cfg: 0x25 },
    // NTAG I2C 1k reports storage size 0x13 like NTAG216 but has a different memory map
    NTAG_I2C_1K: { version: [0x00, 0x04, 0x04, 0x05, 0x02, 0x01, 0x13, 0x03], pages: 231, cfg: null },
    // original MIFARE Ultralight: no GET_VERSION (NAK), 16 pages
    ULTRALIGHT: { version: null, pages: 16, cfg: null }
};

const NAK = { code: 'IO_ERROR', message: 'Transceive failed' };
const LOST = { code: 'TAG_LOST', message: 'Tag was lost.' };

function createTag (type, opts) {
    const o = opts || {};
    const ic = ICS[type];
    if (!ic) { throw new Error('unknown IC ' + type); }
    const uid = o.uid || [0x04, 0xE1, 0x0C, 0xDA, 0x99, 0x3C, 0x80];
    const mem = new Uint8Array(ic.pages * 4);
    for (let p = 0; p < ic.pages; p++) { mem.set([p, p ^ 0xFF, 0xA5, 0x5A], p * 4); }
    // UID pages: UID0-2 + BCC0, UID3-6, BCC1 + internal + lock bytes
    const bcc0 = 0x88 ^ uid[0] ^ uid[1] ^ uid[2];
    const bcc1 = uid[3] ^ uid[4] ^ uid[5] ^ uid[6];
    mem.set([uid[0], uid[1], uid[2], bcc0, uid[3], uid[4], uid[5], uid[6], bcc1, 0x48, 0x00, 0x00, 0xE1, 0x10, 0x3E, 0x00], 0);
    const state = {
        type, ic, mem, uid,
        pwd: [0xFF, 0xFF, 0xFF, 0xFF],
        pack: [0x00, 0x00],
        authenticated: false,
        halted: false,
        connected: true,
        counter: o.counter || 0,
        signature: o.signature || new Array(32).fill(0),
        lostAtRead: typeof o.lostAtRead === 'number' ? o.lostAtRead : -1,
        failedAuths: 0,
        received: []
    };
    if (ic.cfg !== null) {
        mem.set([0x04, 0x00, 0x00, 0xFF], ic.cfg * 4);          // CFG0: MIRROR, RFUI, MIRROR_PAGE, AUTH0=FF
        mem.set([0x00, 0x05, 0x00, 0x00], (ic.cfg + 1) * 4);    // CFG1: ACCESS=0
        mem.set([0, 0, 0, 0], (ic.cfg + 2) * 4);                  // PWD reads as 00
        mem.set([0, 0, 0, 0], (ic.cfg + 3) * 4);                  // PACK reads as 00
    }
    const auth0 = () => (ic.cfg === null ? 0xFF : mem[ic.cfg * 4 + 3]);
    const prot = () => (ic.cfg === null ? false : (mem[(ic.cfg + 1) * 4] & 0x80) !== 0);
    const pageBytes = (p) => {
        if (ic.cfg !== null && (p === ic.cfg + 2 || p === ic.cfg + 3)) { return [0, 0, 0, 0]; }
        return Array.from(mem.slice(p * 4, p * 4 + 4));
    };

    state.setAuth0 = (v) => { mem[ic.cfg * 4 + 3] = v; };
    state.setProt = (on) => { mem[(ic.cfg + 1) * 4] = on ? (mem[(ic.cfg + 1) * 4] | 0x80) : (mem[(ic.cfg + 1) * 4] & 0x7F); };
    state.setPassword = (pwd, pack) => { state.pwd = pwd.slice(); state.pack = pack.slice(); };
    state.page = (p) => Array.from(mem.slice(p * 4, p * 4 + 4));

    // returns [ok, responseArray] or [false, error]
    state.handle = function (cmd) {
        state.received.push(Array.from(cmd));
        if (!state.connected) { return [false, { code: 'NOT_CONNECTED', message: 'Not connected' }]; }
        if (state.halted) { return [false, LOST]; }
        const nak = () => { state.halted = true; state.authenticated = false; return [false, NAK]; };
        switch (cmd[0]) {
        case 0x60:
            if (!ic.version) { return nak(); }
            return [true, ic.version.slice()];
        case 0x30: {
            const page = cmd[1];
            if (page >= ic.pages) { return nak(); }
            if (state.lostAtRead === page) { state.connected = false; return [false, LOST]; }
            const out = [];
            for (let i = 0; i < 4; i++) {
                const p = (page + i) % ic.pages;
                if (prot() && !state.authenticated && p >= auth0()) {
                    if (i === 0) { return nak(); }
                    // the silicon rolls over to page 0 rather than reading protected pages
                    out.push(...pageBytes(i === 0 ? p : (p - auth0() + 0) % ic.pages));
                } else {
                    out.push(...pageBytes(p));
                }
            }
            return [true, out];
        }
        case 0xA2: {
            const page = cmd[1];
            if (cmd.length !== 6 || page >= ic.pages) { return nak(); }
            if (!state.authenticated && page >= auth0()) { return nak(); }
            if (ic.cfg !== null && page === ic.cfg + 2) { state.pwd = Array.from(cmd.slice(2, 6)); return [true, [0x0A]]; }
            if (ic.cfg !== null && page === ic.cfg + 3) { state.pack = Array.from(cmd.slice(2, 4)); return [true, [0x0A]]; }
            mem.set(cmd.slice(2, 6), page * 4);
            return [true, [0x0A]];
        }
        case 0x1B: {
            if (ic.cfg === null || cmd.length !== 5) { return nak(); }
            const ok = [0, 1, 2, 3].every(i => cmd[1 + i] === state.pwd[i]);
            if (!ok) { state.failedAuths++; return nak(); }
            state.authenticated = true;
            return [true, state.pack.slice()];
        }
        case 0x3C:
            if (!ic.version) { return nak(); }
            return [true, state.signature.slice()];
        case 0x39:
            if (!ic.version) { return nak(); }
            return [true, [state.counter & 0xFF, (state.counter >> 8) & 0xFF, (state.counter >> 16) & 0xFF]];
        default:
            return nak();
        }
    };
    return state;
}

/** Wire a fake tag into a loadPlugin() bridge: connect/close/transceive. */
function attach (plugin, tag) {
    plugin.native
        .on('connect', (args, win) => { tag.connected = true; tag.halted = false; tag.authenticated = false; tag.connects = (tag.connects || 0) + 1; win({ maxTransceiveLength: 253 }); })
        .on('close', (args, win) => { tag.connected = false; win(); })
        .on('transceive', (args, win, fail) => {
            const a = args[0];
            const bytes = a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a.buffer || a);
            const [ok, res] = tag.handle(bytes);
            if (ok) { win(new Uint8Array(res).buffer); } else { fail(res); }
        });
    return tag;
}

module.exports = { createTag, attach, ICS };
