const path = require('path');
const { createAttackerApp } = require('./app');

const PORT = Number.parseInt(process.env.SLEEP_SERVER_PORT || process.env.PORT || '3001', 10);
const exploitPagePath = path.join(__dirname, 'exploit.html');

const app = createAttackerApp({ exploitPagePath });

app.listen(PORT, () => {
  console.log(`Attacker server listening on port ${PORT}`);
});
