# AskUp — Audience Response App

A microservices-based live Q&A web app where audiences submit questions, select a topic, and upvote each other's questions in real time.

---

## Architecture

```
                        Internet
                           │
                      ┌────▼─────┐
                      │  Nginx   │  Port 80  (API Gateway)
                      │ Gateway  │
                      └────┬─────┘
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐  ┌──▼──────┐  ┌─▼───────────┐
       │  Frontend   │  │Question │  │   Vote      │
       │  (Nginx)    │  │Service  │  │  Service    │
       │  :80        │  │  :3001  │  │   :3002     │
       └─────────────┘  └────┬────┘  └─────┬───────┘
                             │              │
                        ┌────▼───┐    ┌─────▼───┐
                        │SQLite  │    │ SQLite  │
                        │questions│   │  votes  │
                        └────────┘    └─────────┘
```

### Services

| Service | Port | Responsibility |
|---|---|---|
| **API Gateway** (Nginx) | 80 | Routes `/api/questions` → Question Service, `/api/votes` → Vote Service, `/` → Frontend. Rate limiting included. |
| **Question Service** (Node.js) | 3001 | CRUD for questions, vote count updates, topic listing |
| **Vote Service** (Node.js) | 3002 | Tracks per-voter upvotes, calls Question Service to update counts |
| **Frontend** (Nginx static) | 80 (internal) | Submit page + live feed page |

---

## Local Development

```bash
# Clone / extract the project
cd audience-response

# Build and start everything
docker compose up --build

# Open in browser
open http://localhost
```

---

## Google Cloud Platform Deployment

### 1. Create a GCP VM

```bash
gcloud compute instances create askup-vm \
  --machine-type=e2-small \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --tags=http-server \
  --boot-disk-size=20GB
```

### 2. Open firewall for HTTP

```bash
gcloud compute firewall-rules create allow-http \
  --allow tcp:80 \
  --target-tags http-server \
  --description "Allow HTTP for AskUp"
```

### 3. Copy project to VM

```bash
# From your local machine:
gcloud compute scp --recurse ./audience-response askup-vm:~/
```

### 4. SSH into VM and deploy

```bash
gcloud compute ssh askup-vm

# Inside VM:
cd audience-response
chmod +x deploy.sh
./deploy.sh
```

### 5. Access the app

```bash
# Get your VM's external IP
gcloud compute instances describe askup-vm \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

Then open `http://<YOUR_EXTERNAL_IP>` in your browser.

---

## Customizing Topics

Edit the `<select>` in `frontend/index.html` to change the topic options:

```html
<option value="General">General</option>
<option value="Technology">Technology</option>
<!-- Add your own topics here -->
```

Then rebuild: `docker compose up --build -d`

---

## API Reference

### Question Service (`/api/questions`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/questions` | List questions. Query: `?topic=X&sort=votes\|newest\|oldest` |
| `GET` | `/api/questions/topics` | Get all distinct topics |
| `GET` | `/api/questions/:id` | Get a single question |
| `POST` | `/api/questions` | Submit a question `{ text, topic, author? }` |
| `PATCH` | `/api/questions/:id/votes` | Update vote count `{ delta: 1 \| -1 }` (internal) |

### Vote Service (`/api/votes`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/votes` | Cast or remove a vote `{ questionId, fingerprint, action: "upvote"\|"remove" }` |
| `GET` | `/api/votes/my-votes` | Get all voted question IDs `?fingerprint=X` |
| `GET` | `/api/votes/status/:questionId` | Check if voted `?fingerprint=X` |
| `GET` | `/api/votes/count/:questionId` | Get vote count for a question |

---

## Useful Commands

```bash
# View running services
docker compose ps

# View logs (all services)
docker compose logs -f

# View logs for one service
docker compose logs -f question-service

# Restart a service
docker compose restart vote-service

# Stop everything
docker compose down

# Stop and remove data volumes
docker compose down -v

# Rebuild after code changes
docker compose up --build -d
```

---

## Data Persistence

SQLite databases are stored in Docker named volumes:
- `question-data` → question records
- `vote-data` → vote records

These persist across container restarts. To back up:

```bash
# Copy SQLite DB from container
docker compose cp question-service:/data/questions.db ./backup-questions.db
docker compose cp vote-service:/data/votes.db ./backup-votes.db
```
