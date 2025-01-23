require('dotenv').config(); // Charge les variables d'environnement depuis le fichier .env

module.exports = {
  development: {
    client: 'pg', // Utilisation de PostgreSQL comme client
    connection: process.env.DATABASE_URL_EXTERNE, // URL externe pour accéder à la base de données
    migrations: {
      directory: './migrations', // Répertoire des migrations
    },
    seeds: {
      directory: './seeds', // Répertoire des seeds
    },
    pool: {
      min: 2, // Connexions minimales
      max: 10, // Connexions maximales
    },
  },
  production: {
    client: 'pg', // Utilisation de PostgreSQL pour la production
    connection: process.env.DATABASE_URL_INTERNE, // URL interne pour Render
    migrations: {
      directory: './migrations', // Répertoire des migrations
    },
    seeds: {
      directory: './seeds', // Répertoire des seeds
    },
    pool: {
      min: 2,
      max: 10,
    },
  },
  test: {
    client: 'pg',
    connection: process.env.DATABASE_URL_EXTERNE, // URL externe pour les tests
    migrations: {
      directory: './migrations', // Répertoire des migrations
    },
    seeds: {
      directory: './seeds', // Répertoire des seeds
    },
    pool: {
      min: 2,
      max: 10,
    },
  },
};
