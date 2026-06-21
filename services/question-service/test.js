const request = require('supertest');
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Create a test database in temp directory
const testDbPath = path.join(os.tmpdir(), `test_questions_${Date.now()}.db`);

// Initialize test app (mimics server.js)
const app = express();
const db = new Database(testDbPath);

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
  if (topic.trim().length > 50) {
    return res.status(400).json({ error: 'Topic must be 50 characters or less' });
  }
  next();
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'question-service' });
});

// POST /api/questions — Create a new question
app.post('/api/questions', validateQuestion, (req, res) => {
  try {
    const { text, topic, author } = req.body;
    const id = uuidv4();
    
    const stmt = db.prepare(`
      INSERT INTO questions (id, text, topic, author, vote_count)
      VALUES (?, ?, ?, ?, 0)
    `);
    
    stmt.run(id, text.trim(), topic.trim(), author || 'Anonymous');
    
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
    res.status(201).json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/questions — Get all questions (with optional filtering)
app.get('/api/questions', (req, res) => {
  try {
    const { topic, sort } = req.query;
    let query = 'SELECT * FROM questions';
    let params = [];

    if (topic) {
      query += ' WHERE topic = ?';
      params.push(topic);
    }

    if (sort === 'votes') {
      query += ' ORDER BY vote_count DESC, created_at DESC';
    } else {
      query += ' ORDER BY created_at DESC';
    }

    const questions = db.prepare(query).all(...params);
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/questions/:id — Get a single question
app.get('/api/questions/:id', (req, res) => {
  try {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/questions/:id/vote — Increment vote count
app.put('/api/questions/:id/vote', (req, res) => {
  try {
    const stmt = db.prepare('UPDATE questions SET vote_count = vote_count + 1 WHERE id = ?');
    const result = stmt.run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    res.json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/topics — Get all topics
app.get('/api/topics', (req, res) => {
  try {
    const topics = db.prepare('SELECT DISTINCT topic FROM questions ORDER BY topic ASC').all();
    res.json(topics.map(t => t.topic));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/questions/:id — Delete a question
app.delete('/api/questions/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM questions WHERE id = ?');
    const result = stmt.run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json({ message: 'Question deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TESTS ====================

console.log('\n🧪 Question Service Tests\n');

let testsPassed = 0;
let testsFailed = 0;

async function runTests() {
  try {
    // Test 1: Health check
    console.log('Test 1: GET /health');
    const healthRes = await request(app).get('/health');
    if (healthRes.status === 200 && healthRes.body.service === 'question-service') {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 2: Create a question
    console.log('Test 2: POST /api/questions (valid question)');
    const createRes = await request(app)
      .post('/api/questions')
      .send({
        text: 'What is the best practice for error handling?',
        topic: 'Backend',
        author: 'John'
      });
    
    if (createRes.status === 201 && createRes.body.id && createRes.body.text) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    const questionId = createRes.body.id;

    // Test 3: Get all questions
    console.log('Test 3: GET /api/questions');
    const getAllRes = await request(app).get('/api/questions');
    if (getAllRes.status === 200 && Array.isArray(getAllRes.body) && getAllRes.body.length > 0) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 4: Get single question
    console.log('Test 4: GET /api/questions/:id');
    const getOneRes = await request(app).get(`/api/questions/${questionId}`);
    if (getOneRes.status === 200 && getOneRes.body.id === questionId) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 5: Invalid question (missing text)
    console.log('Test 5: POST /api/questions (missing text - should fail)');
    const invalidRes = await request(app)
      .post('/api/questions')
      .send({ topic: 'Backend' });
    
    if (invalidRes.status === 400) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 6: Vote on question
    console.log('Test 6: PUT /api/questions/:id/vote');
    const voteRes = await request(app).put(`/api/questions/${questionId}/vote`);
    if (voteRes.status === 200 && voteRes.body.vote_count === 1) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 7: Get topics
    console.log('Test 7: GET /api/topics');
    const topicsRes = await request(app).get('/api/topics');
    if (topicsRes.status === 200 && Array.isArray(topicsRes.body)) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 8: Filter by topic
    console.log('Test 8: GET /api/questions?topic=Backend');
    const filterRes = await request(app).get('/api/questions?topic=Backend');
    if (filterRes.status === 200 && Array.isArray(filterRes.body)) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 9: Delete question
    console.log('Test 9: DELETE /api/questions/:id');
    const deleteRes = await request(app).delete(`/api/questions/${questionId}`);
    if (deleteRes.status === 200) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 10: Get deleted question (should fail)
    console.log('Test 10: GET /api/questions/:id (after delete - should fail)');
    const getDeletedRes = await request(app).get(`/api/questions/${questionId}`);
    if (getDeletedRes.status === 404) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 11: Sort by votes
    console.log('Test 11: GET /api/questions?sort=votes');
    const sortRes = await request(app).get('/api/questions?sort=votes');
    if (sortRes.status === 200 && Array.isArray(sortRes.body)) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

  } catch (err) {
    console.error('Test execution error:', err.message);
    testsFailed++;
  } finally {
    // Cleanup
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Summary
    console.log('========================================');
    console.log(`Tests Passed: ${testsPassed}`);
    console.log(`Tests Failed: ${testsFailed}`);
    console.log('========================================\n');

    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

runTests();
