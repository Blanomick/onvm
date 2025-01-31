const { Client } = require('pg');

const client = new Client({
    host: 'dpg-cu3qdkhu0jms73dnpo10-a.oregon-postgres.render.com',
    user: 'onvmdb_user',
    database: 'onvmdb',
    password: 's8BEoy1je9KdtAG4eAuliUkyw3UCdhuU',
    port: 5432,
    ssl: { rejectUnauthorized: false },
});

(async () => {
    try {
        await client.connect();
        console.log('Connexion réussie à la base de données.');

        const res = await client.query(`
            SELECT * FROM pg_catalog.pg_tables
            WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema';
        `);
        console.table(res.rows);
    } catch (err) {
        console.error('Erreur lors de la connexion ou de la requête :', err.message);
    } finally {
        await client.end();
    }
})();
