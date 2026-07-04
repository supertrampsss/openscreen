/**
 * Bascule du mode poussée (§5.6) — utilisée dans Journal et Réglages.
 * Pilule secondaire ; libellé selon l'état courant.
 */

import { useTranslation } from "react-i18next";
import { PillButton } from "@/components/ui";
import { useFlare } from "./FlareContext";

export function FlareToggle() {
	const { t } = useTranslation("common");
	const { flare, setActive } = useFlare();

	return (
		<PillButton
			testID="flare-toggle"
			label={flare.active ? t("flare.toggleOff") : t("flare.toggleOn")}
			variant="secondary"
			onPress={() => setActive(!flare.active)}
			accessibilityLabel={flare.active ? t("flare.toggleOff") : t("flare.toggleOn")}
		/>
	);
}
