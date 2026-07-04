#!/usr/bin/env node

/**
 * Génère les assets de marque Crohnicle (§2, §3) — SANS dépendance externe.
 *
 * Monogramme « C » violet (#8B5CF6) sur fond gris clair (#F7F7F8), anti-aliasé
 * par supersampling, encodé PNG à la main (zlib intégré). Reproductible et sans
 * lockfile modifié (aucune lib de rasterisation n'est disponible dans l'env).
 *
 * Usage : node scripts/gen-icons.mjs
 * Produit : assets/images/{icon,splash-icon,favicon,android-icon-foreground,
 *           android-icon-background,android-icon-monochrome}.png
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const VIOLET = [0x8b, 0x5c, 0xf6];
const BG = [0xf7, 0xf7, 0xf8];
const BLACK = [0x0a, 0x0a, 0x0a];

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
 * Dessine le monogramme « C » : un arc épais (anneau ouvert à droite) avec des
 * extrémités arrondies. Renvoie la couverture [0,1] d'un point (supersampling).
 */
function makeCoverage(size, opts) {
	const cx = size / 2;
	const cy = size / 2;
	const outerR = size * opts.radius;
	const strokeW = size * opts.stroke;
	const innerR = outerR - strokeW;
	const midR = (outerR + innerR) / 2;
	const gap = (opts.gapDeg * Math.PI) / 180; // demi-angle d'ouverture (à droite)
	const cap = strokeW / 2;
	// extrémités de l'arc (à ±gap autour de l'axe droit).
	const e1 = [cx + midR * Math.cos(gap), cy + midR * Math.sin(gap)];
	const e2 = [cx + midR * Math.cos(-gap), cy + midR * Math.sin(-gap)];

	const on = (x, y) => {
		const dx = x - cx;
		const dy = y - cy;
		const d = Math.hypot(dx, dy);
		if (d >= innerR && d <= outerR) {
			const ang = Math.atan2(dy, dx); // [-π,π], 0 = droite
			if (Math.abs(ang) >= gap) return true;
		}
		if (Math.hypot(x - e1[0], y - e1[1]) <= cap) return true;
		if (Math.hypot(x - e2[0], y - e2[1]) <= cap) return true;
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

/** Construit le RGBA : « C » `fg` composé sur `bg` (bg null = transparent). */
function render(size, { fg, bg, radius = 0.34, stroke = 0.12, gapDeg = 42 }) {
	const cov = makeCoverage(size, { radius, stroke, gapDeg });
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
// Icône app : « C » violet sur fond gris clair (l'OS applique son propre masque).
write("icon.png", render(1024, { fg: VIOLET, bg: BG }));
// Splash : « C » violet sur transparent (fond via splash backgroundColor).
write("splash-icon.png", render(512, { fg: VIOLET, bg: null }));
// Favicon web.
write("favicon.png", render(64, { fg: VIOLET, bg: null }));
// Android adaptive : premier plan (zone sûre → rayon réduit), fond, monochrome.
write(
	"android-icon-foreground.png",
	render(512, { fg: VIOLET, bg: null, radius: 0.3, stroke: 0.11 }),
);
write("android-icon-background.png", solid(512, BG));
write(
	"android-icon-monochrome.png",
	render(512, { fg: BLACK, bg: null, radius: 0.3, stroke: 0.11 }),
);
console.log("Terminé.");
