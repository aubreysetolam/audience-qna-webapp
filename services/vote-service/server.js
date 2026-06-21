const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3002;
const DB_PATH = process.env.DB_PATH || './votes.db';
const QUESTION_SERVICE_URL = process.env.QUESTION_SERVICE_URL || 'http://question-service:3001';

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize SQLite database
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id TEXT NOT NULL,
    voter_fingerprint TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(question_id, voter_fingerprint)
  );

  CREATE INDEX IF NOT EXISTS idx_question ON votes(question_id);
  CREATE INDEX IF NOT EXISTS idx_fingerprint ON votes(voter_fingerprint);
`);

app.use(cors());
app.use(express.json());

// GET /health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'vote-service' });
});

// GET /api/votes/status/:questionId — check if a voter has voted on a question
app.get('/api/votes/status/:questionId', (req, res) => {
  try {
    const { fingerprint } = req.query;
    if (!fingerprint) {
      return res.status(400).json({ error: 'Voter fingerprint required' });
    }

    const vote = db.prepare(
      'SELECT id FROM votes WHERE question_id = ? AND voter_fingerprint = ?'
    ).get(req.params.questionId, fingerprint);

    res.json({ hasVoted: !!vote });
  } catch (err) {
    console.error('Error checking vote status:', err);
    res.status(500).json({ error: 'Failed to check vote status' });
  }
});

// GET /api/votes/my-votes — get all question IDs a voter has voted on
app.get('/api/votes/my-votes', (req, res) => {
  try {
    const { fingerprint } = req.query;
    if (!fingerprint) {
      return res.status(400).json({ error: 'Voter fingerprint required' });
    }

    const votes = db.prepare(
      'SELECT question_id FROM votes WHERE voter_fingerprint = ?'
    ).all(fingerprint);

    res.json({ votedQuestionIds: votes.map(v => v.question_id) });
  } catch (err) {
    console.error('Error fetching my votes:', err);
    res.status(500).json({ error: 'Failed to fetch votes' });
  }
});

// POST /api/votes — cast or retract a vote
app.post('/api/votes', async (req, res) => {
  try {
    const { questionId, fingerprint, action } = req.body;

    if (!questionId || !fingerprint) {
      return res.status(400).json({ error: 'questionId and fingerprint required' });
    }

    if (action !== 'upvote' && action !== 'remove') {
      return res.status(400).json({ error: 'action must be "upvote" or "remove"' });
    }

    if (action === 'upvote') {
      // Check if already voted
      const existing = db.prepare(
        'SELECT id FROM votes WHERE question_id = ? AND voter_fingerprint = ?'
      ).get(questionId, fingerprint);

      if (existing) {
        return res.status(409).json({ error: 'Already voted on this question' });
      }

      // Record the vote
      db.prepare(
        'INSERT INTO votes (question_id, voter_fingerprint) VALUES (?, ?)'
      ).run(questionId, fingerprint);

      // Notify question service to increment vote count
      await fetch(`${QUESTION_SERVICE_URL}/api/questions/${questionId}/votes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta: 1 })
      });

      res.status(201).json({ success: true, action: 'upvoted' });

    } else if (action === 'remove') {
      // Check if vote exists
      const existing = db.prepare(
        'SELECT id FROM votes WHERE question_id = ? AND voter_fingerprint = ?'
      ).get(questionId, fingerprint);

      if (!existing) {
        return res.status(404).json({ error: 'No vote found to remove' });
      }

      // Remove the vote
      db.prepare(
        'DELETE FROM votes WHERE question_id = ? AND voter_fingerprint = ?'
      ).run(questionId, fingerprint);

      // Notify question service to decrement vote count
      await fetch(`${QUESTION_SERVICE_URL}/api/questions/${questionId}/votes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta: -1 })
      });

      res.json({ success: true, action: 'removed' });
    }
  } catch (err) {
    console.error('Error processing vote:', err);
    res.status(500).json({ error: 'Failed to process vote' });
  }
});

// GET /api/votes/count/:questionId — get total vote count for a question
app.get('/api/votes/count/:questionId', (req, res) => {
  try {
    const row = db.prepare(
      'SELECT COUNT(*) as count FROM votes WHERE question_id = ?'
    ).get(req.params.questionId);
    res.json({ questionId: req.params.questionId, count: row.count });
  } catch (err) {
    console.error('Error counting votes:', err);
    res.status(500).json({ error: 'Failed to count votes' });
  }
});

app.listen(PORT, () => {
  console.log(`Vote service running on port ${PORT}`);
});

module.exports = app;
