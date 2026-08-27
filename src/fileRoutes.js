const express = require('express');
const multer = require('multer');
const router = express.Router();
const supabase = require('./supabase');

// Multer memory storage configuration (RAM me file hold karega)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// 1. Get user files
router.get('/', async (req, res) => {
  try {
    const { userId, folderId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    let query = supabase
      .from('files')
      .select('*')
      .eq('user_id', userId)
      .eq('is_trashed', false);

    if (folderId) {
      query = query.eq('folder_id', folderId);
    } else {
      query = query.is('folder_id', null);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching files' });
  }
});

// 2. Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const { userId, folderId } = req.body;

    if (!file || !userId) {
      return res.status(400).json({ error: 'File and User ID are required' });
    }

    const filePath = `${userId}/${Date.now()}_${file.originalname}`;

    // Upload to Supabase Storage Bucket
    const { error: uploadError } = await supabase.storage
      .from('user-media')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (uploadError) {
      return res.status(400).json({ error: uploadError.message });
    }

    // Save record in Files Table
    const { data, error: dbError } = await supabase
      .from('files')
      .insert([
        {
          name: file.originalname,
          size_bytes: file.size,
          mime_type: file.mimetype,
          storage_path: filePath,
          folder_id: folderId || null,
          user_id: userId
        }
      ])
      .select();

    if (dbError) {
      return res.status(400).json({ error: dbError.message });
    }

    res.status(201).json({ message: 'File uploaded successfully', file: data[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error uploading file' });
  }
});

module.exports = router;