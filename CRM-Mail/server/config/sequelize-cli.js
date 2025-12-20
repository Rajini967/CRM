'use strict';

const path = require('path');
const dotenv = require('dotenv');

const triedPaths = new Set();
const loadEnvIfExists = (envPath) => {
  if (!envPath || triedPaths.has(envPath)) {
    return;
  }
  triedPaths.add(envPath);
  try {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      console.log(`🔧 Sequelize CLI loaded environment config from ${envPath}`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`⚠️  Sequelize CLI could not read env file ${envPath}: ${err.message}`);
    }
  }
};

const envCandidates = [
  process.env.ENV_FILE && path.resolve(process.env.ENV_FILE),
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '../../.env')
];
envCandidates.forEach(loadEnvIfExists);

const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || '';
if (connectionString) {
  process.env.DATABASE_URL = connectionString;
}

const baseConfig = connectionString
  ? {
      use_env_variable: 'DATABASE_URL',
      url: connectionString,
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      define: {
        timestamps: true,
        underscored: false,
        freezeTableName: true
      },
      dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' || process.env.PGSSLMODE === 'require'
          ? {
              require: true,
              rejectUnauthorized: false
            }
          : false
      }
    }
  : {
      username: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'root',
      database: process.env.PGDATABASE || 'crmdb',
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      define: {
        timestamps: true,
        underscored: false,
        freezeTableName: true
      },
      dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' || process.env.PGSSLMODE === 'require'
          ? {
              require: true,
              rejectUnauthorized: false
            }
          : false
      }
    };

module.exports = {
  development: { ...baseConfig },
  test: connectionString
    ? { ...baseConfig }
    : {
        ...baseConfig,
        database: process.env.PGDATABASE_TEST || `${baseConfig.database}_test`
      },
  production: { ...baseConfig }
};
