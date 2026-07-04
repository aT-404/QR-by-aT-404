import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import routers
import authRouter from './routes/auth.js';
import eventRouter from './routes/event.js';
import qrRouter from './routes/qr.js';
import staffRouter from './routes/staff.js';
import backupRouter from './routes/backup.js';
import reportsRouter from './routes/reports.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable trust proxy for accurate IP tracking (from headers like x-forwarded-for)
app.set('trust proxy', true);

// Configure CORS - open to local development and standard origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve OpenAPI schema statically
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/docs/openapi.json', express.static(path.join(__dirname, 'docs/openapi.json')));

// Mount API routes
app.use('/api/auth', authRouter);
app.use('/api/event', eventRouter);
app.use('/api/qr', qrRouter);
app.use('/api/staff', staffRouter);
app.use('/api/backup', backupRouter);
app.use('/api/reports', reportsRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Event QR Platform backend server is healthy and running.',
    data: {
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  });
});

// 404 handler for unmatched routes
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.url}`,
    errorCode: 'ROUTE_NOT_FOUND'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'An unexpected internal server error occurred.',
    errorCode: 'INTERNAL_SERVER_ERROR'
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 EVENT QR MANAGEMENT PLATFORM BACKEND STARTING`);
  console.log(`📡 Port: http://localhost:${PORT}`);
  console.log(`📖 Swagger API Docs: http://localhost:${PORT}/docs/openapi.json`);
  console.log(`==================================================`);
});
