/**
 * Deep-link / quick action « Photo repas » (§5.12) —
 * `crohnicle://log/photo`. Redirige vers l'accueil avec `quick=photo` : l'écran
 * Home déclenche alors directement le picker photo (scan).
 */

import { Redirect } from "expo-router";

export default function LogPhotoDeepLink() {
	return <Redirect href={{ pathname: "/(tabs)", params: { quick: "photo" } }} />;
}
