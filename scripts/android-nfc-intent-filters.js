'use strict';
/*
 * after_prepare / before_plugin_uninstall (android): background tag reading.
 *
 * Plugin variable NFC_INTENT_FILTERS = none (default) | comma list of ndef, tech, tag
 *   ndef -> NDEF_DISCOVERED filter for each type in NFC_NDEF_MIME_TYPES (default "*\/*"; text
 *           records count as text/plain)
 *   tech -> TECH_DISCOVERED filter + res/xml/cdv_nfc_plugin_tech_filter.xml (any NFC technology)
 *   tag  -> TAG_DISCOVERED filter (last-resort dispatch)
 * The filters go on the launcher activity. Everything the hook writes is identified by plugin-owned
 * names - android:label="@string/cdv_nfc_plugin_intent_filter" on the filters,
 * @xml/cdv_nfc_plugin_tech_filter on the tech meta-data - which survive cordova re-serialising the
 * manifest on every prepare (comments do not) and never match a filter the app wrote itself. So
 * re-running is idempotent, and NFC_INTENT_FILTERS=none or uninstalling removes exactly what the
 * hook added. The tag that launches the app is delivered to the matching nfc.add*Listener (see
 * www/phonegap-nfc.js, "launch tag").
 *
 * The variable is read from platforms/android/android.json (what `cordova plugin add --variable`
 * recorded), then package.json cordova.plugins, then config.xml <plugin><variable>.
 */
const fs = require('fs');
const path = require('path');

const PLUGIN_ID = 'community-cordova-plugin-nfc';
const LABEL_NAME = 'cdv_nfc_plugin_intent_filter';
const LABEL = '@string/' + LABEL_NAME;
const TECH_XML_NAME = 'cdv_nfc_plugin_tech_filter';
const TECH_XML = '@xml/' + TECH_XML_NAME;
const STRINGS_FILE = 'cdv_nfc_plugin_strings.xml';
const TECHS = ['IsoDep', 'NfcA', 'NfcB', 'NfcF', 'NfcV', 'Ndef', 'NdefFormatable', 'MifareClassic', 'MifareUltralight'];

function readJson (file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function readVariables (projectRoot) {
    const vars = {};
    const androidJson = readJson(path.join(projectRoot, 'platforms', 'android', 'android.json'));
    const installed = androidJson && androidJson.installed_plugins && androidJson.installed_plugins[PLUGIN_ID];
    const pkg = readJson(path.join(projectRoot, 'package.json'));
    const fromPkg = pkg && pkg.cordova && pkg.cordova.plugins && pkg.cordova.plugins[PLUGIN_ID];
    let fromConfig = {};
    try {
        const xml = fs.readFileSync(path.join(projectRoot, 'config.xml'), 'utf8');
        const block = xml.match(new RegExp('<plugin[^>]*name="' + PLUGIN_ID + '"[^>]*>([\\s\\S]*?)</plugin>'));
        if (block) {
            for (const m of block[1].matchAll(/<variable\s+name="([^"]+)"\s+value="([^"]*)"/g)) { fromConfig[m[1]] = m[2]; }
        }
    } catch (e) { fromConfig = {}; }
    for (const source of [fromConfig, fromPkg || {}, installed || {}]) {
        for (const key of ['NFC_INTENT_FILTERS', 'NFC_NDEF_MIME_TYPES']) {
            if (source[key] !== undefined && source[key] !== '') { vars[key] = String(source[key]); }
        }
    }
    return vars;
}

function parseKinds (value) {
    const kinds = String(value || 'none').toLowerCase().split(/[\s,]+/).filter(Boolean);
    const valid = kinds.filter(k => ['ndef', 'tech', 'tag'].includes(k));
    const unknown = kinds.filter(k => !['ndef', 'tech', 'tag', 'none'].includes(k));
    return { kinds: [...new Set(valid)], unknown };
}

function buildBlock (kinds, mimeTypes, indent) {
    const lines = [];
    const filter = (action, extra) => {
        lines.push('<intent-filter android:label="' + LABEL + '">');
        lines.push('    <action android:name="' + action + '" />');
        lines.push('    <category android:name="android.intent.category.DEFAULT" />');
        (extra || []).forEach(l => lines.push('    ' + l));
        lines.push('</intent-filter>');
    };
    if (kinds.includes('ndef')) {
        filter('android.nfc.action.NDEF_DISCOVERED', mimeTypes.map(m => '<data android:mimeType="' + m + '" />'));
    }
    if (kinds.includes('tech')) {
        filter('android.nfc.action.TECH_DISCOVERED');
        lines.push('<meta-data android:name="android.nfc.action.TECH_DISCOVERED" android:resource="' + TECH_XML + '" />');
    }
    if (kinds.includes('tag')) {
        filter('android.nfc.action.TAG_DISCOVERED');
    }
    return lines.map(l => indent + l).join('\n') + '\n';
}

function launcherActivity (manifest) {
    const activityRe = /<activity\b[\s\S]*?<\/activity>/g;
    let match;
    while ((match = activityRe.exec(manifest)) !== null) {
        if (match[0].includes('android.intent.category.LAUNCHER')) { return match; }
    }
    return null;
}

function isOurs (element) {
    if (/^<intent-filter\b/.test(element)) {
        const open = element.match(/^<intent-filter\b[^>]*>/)[0];
        return open.includes('android:label="' + LABEL + '"');
    }
    return element.includes('android:resource="' + TECH_XML + '"');
}

/**
 * Removes the elements this hook added before (identified by the plugin-owned label / resource)
 * from the launcher activity and, if kinds is non-empty, adds the requested ones.
 */
function applyToManifest (manifest, kinds, mimeTypes) {
    const activity = launcherActivity(manifest);
    if (!activity) {
        if (!kinds.length) { return manifest; }
        throw new Error(PLUGIN_ID + ': no launcher <activity> found in AndroidManifest.xml');
    }
    let body = activity[0].replace(/[ \t]*(<intent-filter\b[\s\S]*?<\/intent-filter>|<meta-data\b[^>]*\/>)[ \t]*\n?/g,
        (whole, element) => (isOurs(element) ? '' : whole));
    if (kinds.length) {
        const closeAt = body.lastIndexOf('</activity>');
        const lineStart = body.lastIndexOf('\n', closeAt) + 1;
        const closingIndent = body.slice(lineStart, closeAt).match(/^\s*/)[0];
        body = body.slice(0, lineStart) + buildBlock(kinds, mimeTypes, closingIndent + '    ') + body.slice(lineStart);
    }
    return manifest.slice(0, activity.index) + body + manifest.slice(activity.index + activity[0].length);
}

function techFilterXml () {
    return '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<!-- generated by ' + PLUGIN_ID + ' (NFC_INTENT_FILTERS=tech): any NFC technology -->\n' +
        '<resources xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2">\n' +
        TECHS.map(t => '    <tech-list>\n        <tech>android.nfc.tech.' + t + '</tech>\n    </tech-list>\n').join('') +
        '</resources>\n';
}

function stringsXml () {
    // the filters' label: the app's own name, as for the launcher entry
    return '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<!-- generated by ' + PLUGIN_ID + ' (NFC_INTENT_FILTERS) -->\n' +
        '<resources>\n    <string name="' + LABEL_NAME + '">@string/app_name</string>\n</resources>\n';
}

function writeOrRemove (file, content) {
    if (content) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) { fs.writeFileSync(file, content); }
    } else if (fs.existsSync(file)) {
        fs.unlinkSync(file);
    }
}

function run (projectRoot, log, options) {
    const opts = options || {};
    const say = log || (() => {});
    const androidRoot = path.join(projectRoot, 'platforms', 'android');
    const mainDir = path.join(androidRoot, 'app', 'src', 'main');
    const manifestPath = path.join(mainDir, 'AndroidManifest.xml');
    if (!fs.existsSync(manifestPath)) { return { skipped: 'no android platform' }; }
    const vars = opts.uninstall ? { NFC_INTENT_FILTERS: 'none' } : readVariables(projectRoot);
    const { kinds, unknown } = parseKinds(vars.NFC_INTENT_FILTERS);
    if (unknown.length) { say(PLUGIN_ID + ': ignoring unknown NFC_INTENT_FILTERS value(s): ' + unknown.join(', ')); }
    const mimeTypes = String(vars.NFC_NDEF_MIME_TYPES || '*/*').split(/[\s,]+/).filter(Boolean);

    const manifest = fs.readFileSync(manifestPath, 'utf8');
    const updated = applyToManifest(manifest, kinds, mimeTypes);
    if (updated !== manifest) { fs.writeFileSync(manifestPath, updated); }

    writeOrRemove(path.join(mainDir, 'res', 'values', STRINGS_FILE), kinds.length ? stringsXml() : null);
    writeOrRemove(path.join(mainDir, 'res', 'xml', TECH_XML_NAME + '.xml'), kinds.includes('tech') ? techFilterXml() : null);

    say(PLUGIN_ID + ': NFC_INTENT_FILTERS=' + (kinds.length ? kinds.join(',') : 'none'));
    return { kinds, mimeTypes, manifestPath };
}

module.exports = function (context) {
    const platforms = (context.opts && context.opts.platforms) || [];
    if (platforms.length && !platforms.includes('android')) { return; }
    // before_plugin_uninstall: take everything back out
    const uninstall = context.hook === 'before_plugin_uninstall';
    run(context.opts.projectRoot, msg => console.log(msg), { uninstall });
};
module.exports.run = run;
module.exports.applyToManifest = applyToManifest;
module.exports.parseKinds = parseKinds;
