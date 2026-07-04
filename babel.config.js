// Babel — preset Expo + inline-import pour intégrer les migrations drizzle (.sql)
// comme chaînes au build (requis par le driver expo-sqlite).
module.exports = (api) => {
	api.cache(true);
	return {
		presets: ["babel-preset-expo"],
		plugins: [["inline-import", { extensions: [".sql"] }]],
	};
};
