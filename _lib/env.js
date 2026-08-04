// Imported first, and on its own, because of how ESM orders evaluation: every
// import of a module runs before the body of the module that imports it. A
// `dotenv.config()` call sitting in index.js would therefore land *after*
// config.js had already read process.env, and every .env value would be
// silently ignored. Loading it from an import keeps the order right.
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
