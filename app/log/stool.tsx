/**
 * Deep-link / quick action « Selle rapide » (§5.12) —
 * `crohnicle://log/stool`. Redirige vers l'accueil avec `quick=stool` : l'écran
 * Home ouvre alors directement le StoolSheet.
 */

import { Redirect } from "expo-router";

export default function LogStoolDeepLink() {
	return <Redirect href={{ pathname: "/(tabs)", params: { quick: "stool" } }} />;
}
