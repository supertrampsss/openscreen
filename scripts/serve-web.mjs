// Serveur statique minimal pour l'export web Expo (dossier `dist/`), utilisé par
// Playwright (§9, §12). Deux exigences non négociables :
//  1. En-têtes COOP/COEP → active `crossOriginIsolated` (SharedArrayBuffer),
//     requis par le driver WebAssembly d'expo-sqlite (wa-sqlite + OPFS).
//  2. Fallback type SPA compatible export statique expo-router : une route sans
//     extension (`/journal`) sert le fichier `journal.html` s'il existe, sinon
//     `index.html` (routing client).
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const PORT = Number(process.env.PORT ?? 4173);

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".wasm": "application/wasm",
	".ico": "image/x-icon",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".svg": "image/svg+xml",
	".ttf": "font/ttf",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".map": "application/json; charset=utf-8",
};

/** En-têtes d'isolation cross-origin, posés sur CHAQUE réponse. */
function isolationHeaders() {
	return {
		"Cross-Origin-Opener-Policy": "same-origin",
		"Cross-Origin-Embedder-Policy": "require-corp",
		"Cross-Origin-Resource-Policy": "same-origin",
	};
}

/** Résout une URL vers un fichier du dossier exporté, ou null. */
function resolveFile(urlPath) {
	// Empêche la traversée de répertoire.
	const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
	let candidate = join(ROOT, clean);
	if (!candidate.startsWith(ROOT)) return null;

	if (clean === "/" || clean === "") return join(ROOT, "index.html");

	// Fichier tel quel (asset avec extension, ou .html direct).
	if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;

	// Route sans extension → sert le .html statique correspondant s'il existe.
	if (!extname(candidate)) {
		const asHtml = `${candidate}.html`;
		if (existsSync(asHtml)) return asHtml;
		const indexInDir = join(candidate, "index.html");
		if (existsSync(indexInDir)) return indexInDir;
	}
	return null;
}

const server = createServer((req, res) => {
	const file = resolveFile(req.url ?? "/") ?? join(ROOT, "index.html"); // fallback SPA
	if (!existsSync(file)) {
		res.writeHead(404, isolationHeaders());
		res.end("Not found");
		return;
	}
	res.writeHead(200, {
		...isolationHeaders(),
		"Content-Type": MIME[extname(file)] ?? "application/octet-stream",
		"Cache-Control": "no-store",
	});
	createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
	console.log(`serve-web: http://localhost:${PORT} (root: ${ROOT})`);
});
