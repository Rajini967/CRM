const path = require('path');
const dotenv = require('dotenv');
const { Sequelize, DataTypes } = require('sequelize');

const triedPaths = new Set();
const loadEnvIfExists = (envPath) => {
  if (!envPath || triedPaths.has(envPath)) {
    return;
  }
  triedPaths.add(envPath);
  try {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      console.log(`🔧 Loaded environment config from ${envPath}`);
    }
  } catch (err) {
    // Ignore missing files; only log unexpected errors
    if (err.code !== 'ENOENT') {
      console.warn(`⚠️  Unable to load env file ${envPath}: ${err.message}`);
    }
  }
};

// Attempt to load .env regardless of where the server is launched from
const envCandidates = [
  process.env.ENV_FILE && path.resolve(process.env.ENV_FILE),
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '../../.env')
];
envCandidates.forEach(loadEnvIfExists);

const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING;

// Database configuration using individual environment variables
const sequelize = connectionString
  ? new Sequelize(connectionString, {
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
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
          : process.env.PGSSLMODE === 'disable'
          ? false
          : false
      }
    })
  : new Sequelize({
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      database: process.env.PGDATABASE || 'crmdb',
      username: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'root',
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
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
          : process.env.PGSSLMODE === 'disable'
          ? false
          : false
      }
    });

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ PostgreSQL database connection established successfully.');
    console.log('📊 Database:', process.env.PGDATABASE || 'crmdb');
    console.log('👤 User:', process.env.PGUSER || 'postgres');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to PostgreSQL database:', error.message);
    console.error('🔧 Please ensure PostgreSQL is running and credentials are correct');
    return false;
  }
};

module.exports = { sequelize, DataTypes, testConnection };