/*
 * Community Cordova NFC Plugin - NfcPlugin wrapper
 * Licensed under MIT License
 */

// Import from main phonegap-nfc.js (which sets window.nfc)
var nfc = require('./phonegap-nfc').nfc;

module.exports = nfc;
