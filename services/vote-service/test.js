const request = require('supertest');
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Create a test database in temp directory
const testDbPath = path.join(os.tmpdir(), `test_votes_${Date.now()}.db`);

// Initialize test app (mimics server.js)
const app = express();
const db = new Database(testDbPath);

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
      'SELECT * FROM votes WHERE question_id = ? AND voter_fingerprint = ?'
    ).get(req.params.questionId, fingerprint);

    res.json({
      question_id: req.params.questionId,
      fingerprint,
      has_voted: !!vote,
      vote_id: vote ? vote.id : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/votes — Register a vote
app.post('/api/votes', (req, res) => {
  try {
    const { question_id, voter_fingerprint } = req.body;

    if (!question_id || !voter_fingerprint) {
      return res.status(400).json({ error: 'question_id and voter_fingerprint required' });
    }

    // Check if vote already exists
    const existingVote = db.prepare(
      'SELECT * FROM votes WHERE question_id = ? AND voter_fingerprint = ?'
    ).get(question_id, voter_fingerprint);

    if (existingVote) {
      return res.status(409).json({ error: 'Vote already registered for this question' });
    }

    const stmt = db.prepare(
      'INSERT INTO votes (question_id, voter_fingerprint) VALUES (?, ?)'
    );
    const result = stmt.run(question_id, voter_fingerprint);

    res.status(201).json({
      id: result.lastInsertRowid,
      question_id,
      voter_fingerprint
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/votes/count/:questionId — Get total votes for a question
app.get('/api/votes/count/:questionId', (req, res) => {
  try {
    const result = db.prepare(
      'SELECT COUNT(*) as count FROM votes WHERE question_id = ?'
    ).get(req.params.questionId);

    res.json({
      question_id: req.params.questionId,
      vote_count: result.count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/votes/:voteId — Unvote (retract a vote)
app.delete('/api/votes/:voteId', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM votes WHERE id = ?');
    const result = stmt.run(req.params.voteId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Vote not found' });
    }

    res.json({ message: 'Vote deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TESTS ====================

console.log('\n🧪 Vote Service Tests\n');

let testsPassed = 0;
let testsFailed = 0;

async function runTests() {
  try {
    // Test 1: Health check
    console.log('Test 1: GET /health');
    const healthRes = await request(app).get('/health');
    if (healthRes.status === 200 && healthRes.body.service === 'vote-service') {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    const testQuestionId = 'test-question-123';
    const testFingerprint = 'fingerprint-abc';

    // Test 2: Check vote status before voting
    console.log('Test 2: GET /api/votes/status/:questionId (before voting)');
    const statusBeforeRes = await request(app)
      .get(`/api/votes/status/${testQuestionId}`)
      .query({ fingerprint: testFingerprint });
    
    if (statusBeforeRes.status === 200 && statusBeforeRes.body.has_voted === false) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 3: Register a vote
    console.log('Test 3: POST /api/votes');
    const voteRes = await request(app)
      .post('/api/votes')
      .send({
        question_id: testQuestionId,
        voter_fingerprint: testFingerprint
      });
    
    if (voteRes.status === 201 && voteRes.body.id) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    const voteId = voteRes.body.id;

    // Test 4: Check vote status after voting
    console.log('Test 4: GET /api/votes/status/:questionId (after voting)');
    const statusAfterRes = await request(app)
      .get(`/api/votes/status/${testQuestionId}`)
      .query({ fingerprint: testFingerprint });
    
    if (statusAfterRes.status === 200 && statusAfterRes.body.has_voted === true) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 5: Attempt duplicate vote
    console.log('Test 5: POST /api/votes (duplicate - should fail)');
    const duplicateRes = await request(app)
      .post('/api/votes')
      .send({
        question_id: testQuestionId,
        voter_fingerprint: testFingerprint
      });
    
    if (duplicateRes.status === 409) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 6: Get vote count
    console.log('Test 6: GET /api/votes/count/:questionId');
    const countRes = await request(app).get(`/api/votes/count/${testQuestionId}`);
    if (countRes.status === 200 && countRes.body.vote_count === 1) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 7: Missing fingerprint query parameter
    console.log('Test 7: GET /api/votes/status/:questionId (missing fingerprint - should fail)');
    const missingFingerprintRes = await request(app).get(`/api/votes/status/${testQuestionId}`);
    if (missingFingerprintRes.status === 400) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 8: Missing question_id in vote creation
    console.log('Test 8: POST /api/votes (missing question_id - should fail)');
    const missingQIdRes = await request(app)
      .post('/api/votes')
      .send({ voter_fingerprint: 'some-fingerprint' });
    
    if (missingQIdRes.status === 400) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 9: Delete vote
    console.log('Test 9: DELETE /api/votes/:voteId');
    const deleteRes = await request(app).delete(`/api/votes/${voteId}`);
    if (deleteRes.status === 200) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 10: Verify vote was deleted
    console.log('Test 10: GET /api/votes/status/:questionId (after delete)');
    const statusAfterDeleteRes = await request(app)
      .get(`/api/votes/status/${testQuestionId}`)
      .query({ fingerprint: testFingerprint });
    
    if (statusAfterDeleteRes.status === 200 && statusAfterDeleteRes.body.has_voted === false) {
      console.log('  ✓ PASSED\n');
      testsPassed++;
    } else {
      console.log('  ✗ FAILED\n');
      testsFailed++;
    }

    // Test 11: Vote count after deletion
    console.log('Test 11: GET /api/votes/count/:questionId (after delete)');
    const countAfterDeleteRes = await request(app).get(`/api/votes/count/${testQuestionId}`);
    if (countAfterDeleteRes.status === 200 && countAfterDeleteRes.body.vote_count === 0) {
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
