const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || './questions.db';

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize SQLite database
const db = new Database(DB_PATH);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    topic TEXT NOT NULL,
    author TEXT,
    vote_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_topic ON questions(topic);
  CREATE INDEX IF NOT EXISTS idx_created_at ON questions(created_at);
  CREATE INDEX IF NOT EXISTS idx_vote_count ON questions(vote_count);
`);

app.use(cors());
app.use(express.json());

// Validation middleware
function validateQuestion(req, res, next) {
  const { text, topic } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Question text is required' });
  }
  if (text.trim().length > 500) {
    return res.status(400).json({ error: 'Question must be 500 characters or less' });
  }
  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    return res.status(400).json({ error: 'Topic is required' });
  }
  next();
}

// GET /health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'question-service' });
});

// GET /api/questions — list all questions with optional filters
app.get('/api/questions', (req, res) => {
  try {
    const { topic, sort = 'votes' } = req.query;

    let query = 'SELECT * FROM questions';
    const params = [];

    if (topic) {
      query += ' WHERE topic = ?';
      params.push(topic);
    }

    if (sort === 'votes') {
      query += ' ORDER BY vote_count DESC, created_at DESC';
    } else if (sort === 'newest') {
      query += ' ORDER BY created_at DESC';
    } else if (sort === 'oldest') {
      query += ' ORDER BY created_at ASC';
    } else {
      query += ' ORDER BY vote_count DESC, created_at DESC';
    }

    const questions = db.prepare(query).all(...params);
    res.json({ questions, total: questions.length });
  } catch (err) {
    console.error('Error fetching questions:', err);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// GET /api/questions/topics — list all distinct topics
app.get('/api/questions/topics', (req, res) => {
  try {
    const rows = db.prepare('SELECT DISTINCT topic FROM questions ORDER BY topic').all();
    const topics = rows.map(r => r.topic);
    res.json({ topics });
  } catch (err) {
    console.error('Error fetching topics:', err);
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

// GET /api/questions/:id — get a single question
app.get('/api/questions/:id', (req, res) => {
  try {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.json(question);
  } catch (err) {
    console.error('Error fetching question:', err);
    res.status(500).json({ error: 'Failed to fetch question' });
  }
});

// POST /api/questions — submit a new question
app.post('/api/questions', validateQuestion, (req, res) => {
  try {
    const { text, topic, author } = req.body;
    const id = uuidv4();
    const cleanText = text.trim();
    const cleanTopic = topic.trim();
    const cleanAuthor = author ? author.trim().substring(0, 100) : null;

    db.prepare(`
      INSERT INTO questions (id, text, topic, author)
      VALUES (?, ?, ?, ?)
    `).run(id, cleanText, cleanTopic, cleanAuthor);

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
    res.status(201).json(question);
  } catch (err) {
    console.error('Error creating question:', err);
    res.status(500).json({ error: 'Failed to submit question' });
  }
});

// PATCH /api/questions/:id/votes — update vote count (called by vote service)
app.patch('/api/questions/:id/votes', (req, res) => {
  try {
    const { delta } = req.body; // +1 or -1
    if (typeof delta !== 'number' || (delta !== 1 && delta !== -1)) {
      return res.status(400).json({ error: 'delta must be 1 or -1' });
    }

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const newCount = Math.max(0, question.vote_count + delta);
    db.prepare('UPDATE questions SET vote_count = ? WHERE id = ?').run(newCount, req.params.id);

    const updated = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating votes:', err);
    res.status(500).json({ error: 'Failed to update votes' });
  }
});

app.listen(PORT, () => {
  console.log(`Question service running on port ${PORT}`);
});

module.exports = app;
