// src/app.ts
import express from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';

const app = express();
const PORT = 3000;

// Database connections
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: 5432,
  database: 'simpleapp',
  user: 'postgres',
  password: 'password',
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: 6379,
});

app.use(express.json());

// Wait for database connection
async function waitForDB() {
  const maxRetries = 30;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      await db.query('SELECT 1');
      console.log('Database connected successfully');
      return;
    } catch (error) {
      retries++;
      console.log(
        `Database connection attempt ${retries}/${maxRetries} failed, retrying in 2s...`
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error('Could not connect to database after maximum retries');
}

// Initialize database
async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('Database initialized');
}

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Simple TypeScript App' });
});

app.get('/items', async (req, res) => {
  try {
    // Try cache first
    const cached = await redis.get('items');
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const result = await db.query('SELECT * FROM items ORDER BY id');
    await redis.setex('items', 60, JSON.stringify(result.rows));
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/items', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await db.query(
      'INSERT INTO items (name) VALUES ($1) RETURNING *',
      [name]
    );

    // Clear cache
    await redis.del('items');

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Start server
async function start() {
  await waitForDB();
  await initDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(console.error);
