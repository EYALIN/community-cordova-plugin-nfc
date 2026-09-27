'use strict';
// PLU-231: scripts/android-nfc-intent-filters.js against the AndroidManifest.xml that
// cordova-android 14 generates (fixtures/), in a throwaway project directory.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const hook = require('../../scripts/android-nfc-intent-filters.js');

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'cordova-android-14-AndroidManifest.xml'), 'utf8');

function project (vars) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-hook-'));
    const main = path.join(root, 'platforms', 'android', 'app', 'src', 'main');
    fs.mkdirSync(path.join(main, 'res', 'xml'), { recursive: true });
    fs.writeFileSync(path.join(main, 'AndroidManifest.xml'), FIXTURE);
    fs.writeFileSync(path.join(root, 'platforms', 'android', 'android.json'), JSON.stringify({
        installed_plugins: { 'community-cordova-plugin-nfc': Object.assign({ PACKAGE_NAME: 'com.example' }, vars) }
    }));
    return {
        root,
        manifest: () => fs.readFileSync(path.join(main, 'AndroidManifest.xml'), 'utf8'),
        techXml: path.join(main, 'res', 'xml', 'cdv_nfc_plugin_tech_filter.xml'),
        appTechXml: path.join(main, 'res', 'xml', 'nfc_tech_filter.xml'),
        strings: path.join(main, 'res', 'values', 'cdv_nfc_plugin_strings.xml')
    };
}

function launcherActivity (manifest) {
    return manifest.match(/<activity\b[\s\S]*?<\/activity>/)[0];
}

test('[PLU-231] default (none) leaves the manifest untouched', () => {
    const p = project({ NFC_INTENT_FILTERS: 'none' });
    hook.run(p.root);
    assert.strictEqual(p.manifest(), FIXTURE);
    assert.ok(!fs.existsSync(p.techXml));
});

test('[PLU-231] ndef,tech adds NDEF_DISCOVERED + TECH_DISCOVERED filters and the tech list to the launcher activity', () => {
    const p = project({ NFC_INTENT_FILTERS: 'ndef,tech' });
    hook.run(p.root);
    const activity = launcherActivity(p.manifest());
    assert.match(activity, /android\.intent\.category\.LAUNCHER/);
    assert.match(activity, /<intent-filter android:label="@string\/cdv_nfc_plugin_intent_filter">\s*<action android:name="android\.nfc\.action\.NDEF_DISCOVERED" \/>\s*<category android:name="android\.intent\.category\.DEFAULT" \/>\s*<data android:mimeType="\*\/\*" \/>/);
    assert.match(fs.readFileSync(p.strings, 'utf8'), /<string name="cdv_nfc_plugin_intent_filter">@string\/app_name<\/string>/);
    assert.match(activity, /<action android:name="android\.nfc\.action\.TECH_DISCOVERED" \/>/);
    assert.match(activity, /<meta-data android:name="android\.nfc\.action\.TECH_DISCOVERED" android:resource="@xml\/cdv_nfc_plugin_tech_filter" \/>/);
    assert.doesNotMatch(activity, /TAG_DISCOVERED/);
    const tech = fs.readFileSync(p.techXml, 'utf8');
    for (const t of ['IsoDep', 'NfcA', 'NfcB', 'NfcF', 'NfcV', 'Ndef', 'NdefFormatable', 'MifareClassic', 'MifareUltralight']) {
        assert.match(tech, new RegExp('<tech-list>\\s*<tech>android\\.nfc\\.tech\\.' + t + '</tech>\\s*</tech-list>'), t);
    }
});

test('[PLU-231] re-running prepare is idempotent, and switching back to none removes everything it added', () => {
    const p = project({ NFC_INTENT_FILTERS: 'ndef,tech,tag', NFC_NDEF_MIME_TYPES: 'text/plain,application/vnd.example' });
    hook.run(p.root);
    const once = p.manifest();
    hook.run(p.root);
    assert.strictEqual(p.manifest(), once, 'second prepare changed the manifest');
    assert.strictEqual((once.match(/NDEF_DISCOVERED/g) || []).length, 1);
    assert.match(once, /android:mimeType="text\/plain"/);
    assert.match(once, /android:mimeType="application\/vnd\.example"/);
    assert.match(once, /TAG_DISCOVERED/);
    fs.writeFileSync(path.join(p.root, 'platforms', 'android', 'android.json'), JSON.stringify({ installed_plugins: { 'community-cordova-plugin-nfc': { NFC_INTENT_FILTERS: 'none' } } }));
    hook.run(p.root);
    assert.strictEqual(p.manifest(), FIXTURE, 'disable did not restore the original manifest');
    assert.ok(!fs.existsSync(p.techXml), 'tech filter xml left behind');
    assert.ok(!fs.existsSync(p.strings), 'strings xml left behind');
});

test('[PLU-231] the app\'s own res/xml/nfc_tech_filter.xml is never touched', () => {
    const p = project({ NFC_INTENT_FILTERS: 'tech' });
    const own = '<resources><tech-list><tech>android.nfc.tech.NfcA</tech></tech-list></resources>';
    fs.writeFileSync(p.appTechXml, own);
    hook.run(p.root);
    hook.run(p.root, null, { uninstall: true });
    assert.strictEqual(fs.readFileSync(p.appTechXml, 'utf8'), own);
});

test('[PLU-231] unknown values are ignored; the variable is also read from package.json', () => {
    const p = project({});
    fs.writeFileSync(path.join(p.root, 'package.json'), JSON.stringify({ cordova: { plugins: { 'community-cordova-plugin-nfc': { NFC_INTENT_FILTERS: 'tech, bogus' } } } }));
    const logs = [];
    const r = hook.run(p.root, m => logs.push(m));
    assert.deepStrictEqual(r.kinds, ['tech']);
    assert.ok(logs.some(l => /bogus/.test(l)));
});

test('[PLU-231] plugin.xml wires the hook and declares the two variables with safe defaults', () => {
    const xml = fs.readFileSync(path.join(__dirname, '..', '..', 'plugin.xml'), 'utf8');
    assert.match(xml, /<hook type="after_prepare" src="scripts\/android-nfc-intent-filters\.js" \/>/);
    assert.match(xml, /<preference name="NFC_INTENT_FILTERS" default="none" \/>/);
    assert.match(xml, /<preference name="NFC_NDEF_MIME_TYPES" default="\*\/\*" \/>/);
});

test('[PLU-231] still idempotent after cordova re-serialises the manifest (comments dropped, re-indented)', () => {
    const p = project({ NFC_INTENT_FILTERS: 'ndef,tech' });
    hook.run(p.root);
    const manifestPath = path.join(p.root, 'platforms', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    // what cordova-common's ElementTree write does to it on the next prepare
    const reserialised = p.manifest().replace(/[ \t]*<!--[\s\S]*?-->\n?/g, '').replace(/\n {12}/g, '\n\t\t\t');
    fs.writeFileSync(manifestPath, reserialised);
    hook.run(p.root);
    const m = p.manifest();
    assert.strictEqual((m.match(/android\.nfc\.action\.NDEF_DISCOVERED/g) || []).length, 1, 'NDEF filter duplicated');
    assert.strictEqual((m.match(/@xml\/cdv_nfc_plugin_tech_filter/g) || []).length, 1, 'tech meta-data duplicated');
});

test('[PLU-231] an NFC filter the app wrote itself is kept (different MIME type)', () => {
    const own = FIXTURE.replace('        </activity>', '            <intent-filter>\n                <action android:name="android.nfc.action.NDEF_DISCOVERED" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:mimeType="text/pg" />\n            </intent-filter>\n        </activity>');
    const p = project({ NFC_INTENT_FILTERS: 'ndef' });
    fs.writeFileSync(path.join(p.root, 'platforms', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), own);
    hook.run(p.root);
    hook.run(p.root, null, { uninstall: true });
    assert.strictEqual(p.manifest(), own, 'the app\'s own text/pg filter was changed or the plugin left something behind');
});

test('[PLU-231] uninstall (before_plugin_uninstall) removes the filters and the tech list', () => {
    const p = project({ NFC_INTENT_FILTERS: 'ndef,tech,tag' });
    hook.run(p.root);
    hook.run(p.root, null, { uninstall: true });
    assert.strictEqual(p.manifest(), FIXTURE);
    assert.ok(!fs.existsSync(p.techXml));
});

test('[PLU-231] an app filter with exactly the hook\'s content (NDEF */*) survives turning the feature off', () => {
    const own = FIXTURE.replace('        </activity>', '            <intent-filter>\n                <action android:name="android.nfc.action.NDEF_DISCOVERED" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:mimeType="*/*" />\n            </intent-filter>\n            <meta-data android:name="android.nfc.action.TECH_DISCOVERED" android:resource="@xml/nfc_tech_filter" />\n        </activity>');
    const p = project({ NFC_INTENT_FILTERS: 'ndef,tech' });
    const manifestPath = path.join(p.root, 'platforms', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    fs.writeFileSync(manifestPath, own);
    hook.run(p.root);
    assert.strictEqual((p.manifest().match(/NDEF_DISCOVERED/g) || []).length, 2, 'app filter + plugin filter');
    fs.writeFileSync(path.join(p.root, 'platforms', 'android', 'android.json'), JSON.stringify({ installed_plugins: { 'community-cordova-plugin-nfc': { NFC_INTENT_FILTERS: 'none' } } }));
    hook.run(p.root);
    assert.strictEqual(p.manifest(), own, 'the app\'s own */* filter or tech meta-data was removed');
});
