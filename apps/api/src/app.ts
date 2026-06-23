import express from 'express';
import cors from 'cors';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Basic health route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mymeventos-backend' });
});

export default app;
