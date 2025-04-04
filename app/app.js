const express = require('express');
const { Client } = require('pg');
const retry = require('async-retry');
require('dotenv').config({ path: '.prod.env' });
const app = express();
const port = 3000;

// Конфигурация клиента
const clientConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  connectionTimeoutMillis: 2000,  // Таймаут подключения
  query_timeout: 2000             // Таймаут запросов
};

let client;
let dbConnected = false;

// Универсальная функция для выполнения запросов с проверкой состояния
async function executeQuery(query) {
  if (!dbConnected) {
    throw new Error('No active database connection');
  }

  try {
    const result = await client.query(query);
    return result;
  } catch (err) {
    dbConnected = false;
    console.error('Query error - marking as disconnected:', err.message);
    throw err;
  }
}

// Улучшенная функция подключения
async function connectWithRetry() {
  await retry(
    async () => {
      try {
        client = new Client(clientConfig);
        await client.connect();
        dbConnected = true;
        console.log('✅ Connected to PostgreSQL');
        
        // Обработчик для автоматического переподключения
        client.on('error', async (err) => {
          console.error('⚠️ Connection error:', err.message);
          dbConnected = false;
          await handleReconnect();
        });

      } catch (err) {
        console.error(`⏳ Connection error: ${err.message}. Retrying...`);
        dbConnected = false;
        throw err;
      }
    },
    {
      retries: 5,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 5000,
      onRetry: (err) => {
        console.log(`Retry attempt: ${err.message}`);
      }
    }
  );
}

// Функция переподключения
async function handleReconnect() {
  try {
    await connectWithRetry();
  } catch (err) {
    console.error('❌ Permanent connection failure');
    // Здесь можно добавить дополнительные действия при полном отказе
  }
}

// Инициализация подключения
connectWithRetry().catch(err => {
  console.error('❌ Initial connection failed:', err);
  process.exit(1);
});

// Маршрут с улучшенной обработкой ошибок
app.get('/', async (req, res) => {
  let status = 'Database: ❌ Disconnected';
  let time = 'N/A';

  if (dbConnected) {
    try {
      const result = await executeQuery('SELECT NOW()');
      time = result.rows[0].now;
      status = 'Database: ✅ Connected';
    } catch (err) {
      status = `Database: ⚠️ Connection Lost (${err.message})`;
    }
  }

  res.send(`
    <h1>Node.js + PostgreSQL + Docker</h1>
    <p>${status}</p>
    <p>Current time: ${time}</p>
    <p>Try refreshing the page</p>
    <p>appversion: v1.4</p>
  `);
});

app.listen(port, () => {
  console.log(`App running on port ${port}`);
});
