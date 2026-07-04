// Metro config — ajoute l'extension `.sql` pour importer les migrations drizzle
// (requis par le driver expo-sqlite : drizzle/migrations.js importe les .sql).
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push("sql");
// expo-sqlite (web) charge un worker WebAssembly (wa-sqlite).
config.resolver.assetExts.push("wasm");

module.exports = config;
