const express = require('express');
const router = express.Router();
const supabase = require('./supabase');

// 1. Get all folders for a user
router.get('/', async (req, res) => {
  try {
    const { userId, parentId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    let query = supabase
      .from('folders')
      .select('*')
      .eq('user_id', userId)
      .eq('is_trashed', false);

    if (parentId) {
      query = query.eq('parent_id', parentId);
    } else {
      query = query.is('parent_id', null);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching folders' });
  }
});

// 2. Create a new folder
router.post('/create', async (req, res) => {
  try {
    const { name, userId, parentId } = req.body;

    if (!name || !userId) {
      return res.status(400).json({ error: 'Folder name and User ID are required' });
    }

    const { data, error } = await supabase
      .from('folders')
      .insert([
        {
          name,
          user_id: userId,
          parent_id: parentId || null
        }
      ])
      .select();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ message: 'Folder created', folder: data[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error creating folder' });
  }
});

module.exports = router;
