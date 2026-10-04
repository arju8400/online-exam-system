# Online Examination System (DevOps Mini Project)

Node.js + Express backend, HTML/JS frontend, Jest tests, Docker, GitHub Actions CI, Prometheus + Grafana.

## Run locally
    npm install
    npm test
    npm start          # http://localhost:3000

## Run with Docker (app + Prometheus + Grafana)
    docker compose up -d --build

| Service    | URL                      |
|------------|--------------------------|
| App        | http://localhost:3000    |
| Metrics    | http://localhost:3000/metrics |
| Prometheus | http://localhost:9090    |
| Grafana    | http://localhost:3001 (admin/admin) |

Demo logins: student/student123, admin/admin123 (override via ADMIN_PASSWORD / STUDENT_PASSWORD env vars).
