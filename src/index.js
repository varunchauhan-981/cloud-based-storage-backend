const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./authRoutes');
const folderRoutes = require('./folderRoutes');
const fileRoutes = require('./fileRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/files', fileRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Cloud Media Storage API is running!' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});