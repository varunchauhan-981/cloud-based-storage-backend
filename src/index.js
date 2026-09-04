const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Import Routes
const authRoutes = require('./authRoutes');
const folderRoutes = require('./folderRoutes');
const fileRoutes = require('./fileRoutes');

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/files', fileRoutes);

// Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Port configuration & Server Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
