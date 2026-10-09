'use strict';
// PLU-257: iOS erase()/makeReadOnly() accept an options object and route it to the native call;
// Android keeps its existing (no-options) arg shape unchanged.
// PLU-258: nfc.capabilities() reports {erase, makeReadOnly, ntagPassword, platform} per platform.
const test = require('node:test');
const assert = require('node:assert');
const { loadPlugin } = require('./load-plugin');

// load-plugin.js runs www/phonegap-nfc.js in its own vm context, so array/object literals it
// builds (the `[options]` / `[[]]` args arrays) have THAT context's Array.prototype, not this
// file's - deepStrictEqual treats that prototype mismatch as inequality even when every value
// matches. Rebuild with this realm's Array/Object before comparing.
function plain (v) {
    // NOT v.map(plain): Array.prototype.map builds its result via the species constructor, which
    // for a vm-realm array is still that vm's Array - exactly the mismatch this helper exists to
    // remove. A manual loop pushes into an array literal from THIS realm instead.
    if (Array.isArray(v)) {
        const arr = [];
        for (const item of v) { arr.push(plain(item)); }
        return arr;
    }
    if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) { o[k] = plain(v[k]); }
        return o;
    }
    return v;
}

// ---- PLU-257: erase() routing
test('[PLU-257] android erase() still calls eraseTag with an empty array, ignoring any options', () => {
    const p = loadPlugin({ platform: 'android' });
    let sent;
    p.native.on('eraseTag', (args, win) => { sent = args; win(); });
    p.nfc.erase(() => {}, () => {}, { alertMessage: 'ignored on android' });
    assert.strictEqual(p.calls[0].action, 'eraseTag');
    assert.deepStrictEqual(plain(sent), [[]]);
});

test('[PLU-257] ios erase() passes the options object through as the single eraseTag arg', () => {
    const p = loadPlugin({ platform: 'ios' });
    let sent;
    p.native.on('eraseTag', (args, win) => { sent = args; win(); });
    p.nfc.erase(() => {}, () => {}, { alertMessage: 'Hold near tag' });
    assert.strictEqual(p.calls[0].action, 'eraseTag');
    assert.deepStrictEqual(plain(sent), [{ alertMessage: 'Hold near tag' }]);
});

test('[PLU-257] ios erase() works with no options (undefined passed through)', () => {
    const p = loadPlugin({ platform: 'ios' });
    let sent;
    p.native.on('eraseTag', (args, win) => { sent = args; win(); });
    p.nfc.erase(() => {}, () => {});
    assert.deepStrictEqual(plain(sent), [undefined]);
});

test('[PLU-257] erase() returns a Promise when called without callbacks', async () => {
    const p = loadPlugin({ platform: 'ios' });
    p.native.on('eraseTag', (args, win) => win());
    await p.nfc.erase();
    assert.strictEqual(p.calls[0].action, 'eraseTag');
});

test('[PLU-257] erase() failure (READ_ONLY) reaches the fail callback', () => {
    const p = loadPlugin({ platform: 'ios' });
    p.native.on('eraseTag', (args, win, fail) => fail({ code: 'READ_ONLY', message: 'Tag is read only' }));
    let got;
    p.nfc.erase(() => {}, e => { got = e; }, {});
    assert.strictEqual(got, 'Tag is read only');
});

// ---- PLU-257: makeReadOnly() routing
test('[PLU-257] android makeReadOnly() still calls with no args, ignoring any options', () => {
    const p = loadPlugin({ platform: 'android' });
    let sent;
    p.native.on('makeReadOnly', (args, win) => { sent = args; win(); });
    p.nfc.makeReadOnly(() => {}, () => {}, { alertMessage: 'ignored on android' });
    assert.strictEqual(p.calls[0].action, 'makeReadOnly');
    assert.deepStrictEqual(plain(sent), []);
});

test('[PLU-257] ios makeReadOnly() passes the options object through as the single arg', () => {
    const p = loadPlugin({ platform: 'ios' });
    let sent;
    p.native.on('makeReadOnly', (args, win) => { sent = args; win(); });
    p.nfc.makeReadOnly(() => {}, () => {}, { alertMessage: 'Hold near tag to lock' });
    assert.strictEqual(p.calls[0].action, 'makeReadOnly');
    assert.deepStrictEqual(plain(sent), [{ alertMessage: 'Hold near tag to lock' }]);
});

test('[PLU-257] ios makeReadOnly() on an already-locked tag resolves (alreadyLocked)', async () => {
    const p = loadPlugin({ platform: 'ios' });
    p.native.on('makeReadOnly', (args, win) => win({ alreadyLocked: true }));
    const result = await p.nfc.makeReadOnly(null, null, {});
    assert.strictEqual(result.alreadyLocked, true);
});

test('[PLU-257] ios makeReadOnly() on a tag that cannot be locked fails NOT_SUPPORTED', () => {
    const p = loadPlugin({ platform: 'ios' });
    p.native.on('makeReadOnly', (args, win, fail) => fail({ code: 'NOT_SUPPORTED', message: 'This tag does not support being locked.' }));
    let got;
    p.nfc.makeReadOnly(() => {}, e => { got = e; }, {});
    assert.strictEqual(got, 'This tag does not support being locked.');
});

// ---- PLU-258: capabilities()
test('[PLU-258] android capabilities() resolves synchronously-shaped data with everything true', async () => {
    const p = loadPlugin({ platform: 'android' });
    const caps = await p.nfc.capabilities();
    assert.deepStrictEqual(plain(caps), { erase: true, makeReadOnly: true, ntagPassword: true, platform: 'android' });
    // no native exec call for android - it's answered entirely in JS
    assert.strictEqual(p.calls.length, 0);
});

test('[PLU-258] android capabilities() also supports the callback form', () => {
    const p = loadPlugin({ platform: 'android' });
    let got;
    p.nfc.capabilities(caps => { got = caps; });
    assert.deepStrictEqual(plain(got), { erase: true, makeReadOnly: true, ntagPassword: true, platform: 'android' });
});

test('[PLU-258] ios capabilities() calls into native and reports ntagPassword:false even when native says erase/makeReadOnly true', async () => {
    const p = loadPlugin({ platform: 'ios' });
    p.native.on('capabilities', (args, win) => win({ erase: true, makeReadOnly: true, ntagPassword: false, platform: 'ios' }));
    const caps = await p.nfc.capabilities();
    assert.strictEqual(p.calls[0].action, 'capabilities');
    assert.deepStrictEqual(plain(caps), { erase: true, makeReadOnly: true, ntagPassword: false, platform: 'ios' });
});

test('[PLU-258] ios capabilities() below iOS 13 reports erase/makeReadOnly false', async () => {
    const p = loadPlugin({ platform: 'ios' });
    p.native.on('capabilities', (args, win) => win({ erase: false, makeReadOnly: false, ntagPassword: false, platform: 'ios' }));
    const caps = await p.nfc.capabilities();
    assert.strictEqual(caps.erase, false);
    assert.strictEqual(caps.makeReadOnly, false);
});

test('[PLU-258] an unknown platform (browser, windows, ...) reports every capability false with its own platformId', async () => {
    const p = loadPlugin({ platform: 'browser' });
    const caps = await p.nfc.capabilities();
    assert.deepStrictEqual(plain(caps), { erase: false, makeReadOnly: false, ntagPassword: false, platform: 'browser' });
    assert.strictEqual(p.calls.length, 0);
});

// [PLU-257 round-1] android/browser capabilities() is answered via resolveOrCall() (a plain JS
// value, no native exec). Calling it with only a `fail` callback (no `win`) used to hit neither
// branch - no Promise returned, no callback invoked, the value silently dropped. It must now
// behave like execOrPromise() and hand back a resolved Promise instead.
test('[PLU-257] android capabilities() called with only a fail callback still returns a Promise (does not silently drop the value)', async () => {
    const p = loadPlugin({ platform: 'android' });
    let failCalled = false;
    const result = p.nfc.capabilities(undefined, () => { failCalled = true; });
    assert.ok(result instanceof Promise, 'resolveOrCall() must return a Promise when no win callback is given');
    const caps = await result;
    assert.deepStrictEqual(plain(caps), { erase: true, makeReadOnly: true, ntagPassword: true, platform: 'android' });
    assert.strictEqual(failCalled, false, 'a synthesized capabilities() answer never fails, so fail must not be invoked');
});
