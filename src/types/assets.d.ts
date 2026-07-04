// Déclarations d'assets non-TS importés par le bundler.

// Migrations drizzle : les .sql sont importés comme chaînes par metro
// (voir metro.config.js qui ajoute l'extension `sql`).
declare module "*.sql" {
	const content: string;
	export default content;
}
