const express = require('express');
const router = express.Router();
const supabase = require('./supabase');

const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing token' });
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

router.use(authenticateUser);

router.get('/', async (req, res) => {
  try {
    const parentId = req.query.parentId === 'null' || !req.query.parentId ? null : req.query.parentId;
    let query = supabase.from('folders').select('*').eq('user_id', req.user.id);
    
    if (parentId) query = query.eq('parent_id', parentId);
    else query = query.is('parent_id', null);
    
    const { data, error } = await query.order('name', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tree', async (req, res) => {
  try {
    const { data, error } = await supabase.from('folders').select('id, name, parent_id').eq('user_id', req.user.id);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, parent_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Folder name is required' });
    
    const { data, error } = await supabase.from('folders').insert([{
      name: name.trim(),
      parent_id: parent_id || null,
      user_id: req.user.id
    }]).select().single();
    
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/rename', async (req, res) => {
  try {
    const { name } = req.body;
    const { data, error } = await supabase.from('folders').update({ name: name.trim(), updated_at: new Date() }).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/move', async (req, res) => {
  try {
    const { targetParentId } = req.body;
    const folderId = req.params.id;
    if (folderId === targetParentId) return res.status(400).json({ error: 'Cannot move a folder into itself' });
    
    const { data, error } = await supabase.from('folders').update({ parent_id: targetParentId || null, updated_at: new Date() }).eq('id', folderId).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('folders').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ message: 'Folder deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;