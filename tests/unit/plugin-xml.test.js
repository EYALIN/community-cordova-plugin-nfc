'use strict';
// plugin.xml / package.json contracts.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const xml = fs.readFileSync(process.env.NFC_PLUGIN_XML || path.join(ROOT, 'plugin.xml'), 'utf8');

test('[PLU-221] NFCReaderUsageDescription targets *-Info.plist (cordova-ios <= 7 <Name>-Info.plist and 8 App/App-Info.plist)', () => {
    const m = xml.match(/<config-file target="([^"]+)" parent="NFCReaderUsageDescription">/);
    assert.ok(m, 'no NFCReaderUsageDescription config-file');
    assert.strictEqual(m[1], '*-Info.plist');
});

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const changelog = fs.readFileSync(process.env.NFC_CHANGELOG || path.join(ROOT, 'CHANGELOG.md'), 'utf8');

test('[PLU-229] package.json and plugin.xml carry the same version', () => {
    const m = xml.match(/id="community-cordova-plugin-nfc"\s+version="([^"]+)"/);
    assert.ok(m, 'no plugin version');
    assert.strictEqual(m[1], pkg.version);
});

test('[PLU-229] CHANGELOG has an entry for every version published to npm and for this one', () => {
    // `npm view community-cordova-plugin-nfc versions` on 2026-09-26, plus package.json's version
    const published = ['1.3.0', '1.4.0', '1.5.2', '1.5.3', '1.5.4', '1.5.5', '1.6.0', '1.6.1', '1.6.2', '1.7.0', '1.7.1'];
    for (const v of published.concat([pkg.version])) {
        assert.match(changelog, new RegExp('^## (\\[' + v.replace(/\./g, '\\.') + '\\]|' + v.replace(/\./g, '\\.') + ' )', 'm'), 'no CHANGELOG entry for ' + v);
    }
});

test('[PLU-229] only android and ios are declared; the dead platforms and their sources are gone', () => {
    const platforms = [...xml.matchAll(/<platform name="([^"]+)"/g)].map(m => m[1]).sort();
    assert.deepStrictEqual(platforms, ['android', 'ios']);
    for (const dead of ['src/windows-phone-8', 'src/windows', 'src/blackberry10', 'src/webworks', 'www/phonegap-nfc-blackberry.js', 'www/nfc-plugin.js']) {
        assert.ok(!fs.existsSync(path.join(ROOT, dead)), dead + ' still exists');
    }
});

test('[PLU-229] npm test runs lint, the typings type-test, the unit tests and the Android harness; CI runs them', () => {
    assert.match(pkg.scripts.test, /lint/);
    assert.match(pkg.scripts.test, /test:types/);
    assert.match(pkg.scripts.test, /test:unit/);
    assert.match(pkg.scripts.test, /test:android/);
    const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    for (const step of ['npm run lint', 'npm run test:types', 'npm run test:unit', 'npm run test:android', 'npm run test:ios']) {
        assert.ok(ci.includes(step), 'CI does not run ' + step);
    }
});
