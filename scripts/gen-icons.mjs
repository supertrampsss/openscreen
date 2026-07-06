#!/usr/bin/env node

/**
 * Génère les assets de marque Crohnicle (§2, §3) — SANS dépendance externe.
 *
 * Reproduit la marque `LogoMark` : un anneau ouvert violet (« C » de Crohnicle,
 * gap en haut à droite) accompagné d'un point de continuité, sur un fond doux
 * `#F4F4F7` (« clinique calme »). Anti-aliasé par supersampling, encodé PNG à la
 * main (zlib intégré). Reproductible et sans lockfile modifié (aucune lib de
 * rasterisation n'est disponible dans l'env / le proxy peut bloquer l'install).
 *
 * Usage : node scripts/gen-icons.mjs
 * Produit : assets/images/{icon,splash-icon,favicon,android-icon-foreground,
 *           android-icon-background,android-icon-monochrome}.png
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

// Palette « clinique calme » (cf. src/theme/tokens.ts : `brand` / fonds doux).
const BRAND = [0x6e, 0x63, 0xe6]; // anneau violet
const BG = [0xf4, 0xf4, 0xf7]; // fond clair, doux
const MONO = [0x0a, 0x0a, 0x0a]; // gabarit monochrome Android (l'OS applique sa teinte)

// --- CRC32 (pour les chunks PNG) -----------------------------------------
const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const typeBuf = Buffer.from(type, "ascii");
	const body = Buffer.concat([typeBuf, data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body), 0);
	return Buffer.concat([len, body, crc]);
}

/** Encode un buffer RGBA (size×size) en PNG. */
function encodePng(size, rgba) {
	const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type RGBA
	// raw scanlines : 1 octet de filtre (0) par ligne + RGBA
	const stride = size * 4;
	const raw = Buffer.alloc((stride + 1) * size);
	for (let y = 0; y < size; y++) {
		raw[y * (stride + 1)] = 0;
		rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
	}
	const idat = deflateSync(raw, { level: 9 });
	return Buffer.concat([
		sig,
		chunk("IHDR", ihdr),
		chunk("IDAT", idat),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

/**
 * Renvoie une fonction de couverture [0,1] pour la marque : anneau ouvert
 * (« C ») avec un gap en haut à droite + un point de continuité, à l'image de
 * `LogoMark` (path `M20.5 7.2A9 9 0 1 0 23 14` + point (22.4, 7.6)).
 *
 * Repère écran : y vers le bas, angle 0 = droite, angles négatifs = vers le haut.
 * Le gap est centré sur `gapCenterDeg` et fait `2*gapHalfDeg` d'ouverture ; le
 * point est posé juste au-delà de l'extrémité haute du gap.
 */
function makeCoverage(size, opts) {
	const {
		radius = 0.32, // rayon extérieur (fraction de la taille)
		stroke = 0.11, // épaisseur du trait (fraction de la taille)
		gapCenterDeg = -23, // gap en haut à droite (cf. LogoMark)
		gapHalfDeg = 23,
	} = opts;

	const cx = size / 2;
	const cy = size / 2;
	const outerR = size * radius;
	const strokeW = size * stroke;
	const innerR = outerR - strokeW;
	const midR = (outerR + innerR) / 2;
	const cap = strokeW / 2;

	const gapCenter = (gapCenterDeg * Math.PI) / 180;
	const gapHalf = (gapHalfDeg * Math.PI) / 180;
	// Extrémités de l'arc (bords du gap) → caps arrondis.
	const aHigh = gapCenter - gapHalf; // extrémité haute (vers le point)
	const aLow = gapCenter + gapHalf; // extrémité basse (côté droit)
	const capHigh = [cx + midR * Math.cos(aHigh), cy + midR * Math.sin(aHigh)];
	const capLow = [cx + midR * Math.cos(aLow), cy + midR * Math.sin(aLow)];

	// Point de continuité : il flotte dans l'ouverture, juste au-delà du bord
	// extérieur de l'anneau, près de l'extrémité haute (cf. LogoMark : dot à
	// ~-37°, rayon 10.6 pour un anneau de rayon 9).
	const dotAng = gapCenter - gapHalf * 0.55;
	const dotR = outerR + cap * 1.05;
	const dot = [cx + dotR * Math.cos(dotAng), cy + dotR * Math.sin(dotAng)];
	const dotRad = cap * 1.05;

	// Distance angulaire signée min entre `ang` et le centre du gap.
	const inGap = (ang) => {
		let d = ang - gapCenter;
		while (d > Math.PI) d -= 2 * Math.PI;
		while (d < -Math.PI) d += 2 * Math.PI;
		return Math.abs(d) < gapHalf;
	};

	const on = (x, y) => {
		if (Math.hypot(x - dot[0], y - dot[1]) <= dotRad) return true;
		const dx = x - cx;
		const dy = y - cy;
		const d = Math.hypot(dx, dy);
		if (d >= innerR && d <= outerR && !inGap(Math.atan2(dy, dx))) return true;
		if (Math.hypot(x - capHigh[0], y - capHigh[1]) <= cap) return true;
		if (Math.hypot(x - capLow[0], y - capLow[1]) <= cap) return true;
		return false;
	};

	return (px, py) => {
		let hits = 0;
		for (let sy = 0; sy < 3; sy++) {
			for (let sx = 0; sx < 3; sx++) {
				if (on(px + (sx + 0.5) / 3, py + (sy + 0.5) / 3)) hits++;
			}
		}
		return hits / 9;
	};
}

/** Construit le RGBA : marque `fg` composée sur `bg` (bg null = transparent). */
function render(size, { fg, bg, ...opts }) {
	const cov = makeCoverage(size, opts);
	const rgba = Buffer.alloc(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const a = cov(x, y);
			const i = (y * size + x) * 4;
			if (bg) {
				rgba[i] = Math.round(fg[0] * a + bg[0] * (1 - a));
				rgba[i + 1] = Math.round(fg[1] * a + bg[1] * (1 - a));
				rgba[i + 2] = Math.round(fg[2] * a + bg[2] * (1 - a));
				rgba[i + 3] = 255;
			} else {
				rgba[i] = fg[0];
				rgba[i + 1] = fg[1];
				rgba[i + 2] = fg[2];
				rgba[i + 3] = Math.round(a * 255);
			}
		}
	}
	return encodePng(size, rgba);
}

/** Fond plein (pour l'android-icon-background). */
function solid(size, color) {
	const rgba = Buffer.alloc(size * size * 4);
	for (let i = 0; i < size * size; i++) {
		rgba[i * 4] = color[0];
		rgba[i * 4 + 1] = color[1];
		rgba[i * 4 + 2] = color[2];
		rgba[i * 4 + 3] = 255;
	}
	return encodePng(size, rgba);
}

const out = (name) => path.resolve("assets/images", name);
const write = (name, buf) => {
	writeFileSync(out(name), buf);
	console.log(`  ${name} (${buf.length} b)`);
};

console.log("Génération des assets de marque Crohnicle…");
// Icône app : marque violette sur fond doux, carré plein (iOS/OS applique son
// propre masque arrondi). Anneau ~64 % de la zone → marge de sécurité correcte.
write("icon.png", render(1024, { fg: BRAND, bg: BG }));
// Splash : marque violette sur transparent (fond via splash backgroundColor).
write("splash-icon.png", render(512, { fg: BRAND, bg: null }));
// Favicon web.
write("favicon.png", render(64, { fg: BRAND, bg: null }));
// Android adaptive : premier plan (zone sûre → anneau resserré), fond, monochrome.
write(
	"android-icon-foreground.png",
	render(512, { fg: BRAND, bg: null, radius: 0.28, stroke: 0.1 }),
);
write("android-icon-background.png", solid(512, BG));
write(
	"android-icon-monochrome.png",
	render(512, { fg: MONO, bg: null, radius: 0.28, stroke: 0.1 }),
);
console.log("Terminé.");
