const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const supabase = require('./supabase');

const upload = multer({ storage: multer.memoryStorage() });

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

// ---------------- FILE CRUD ----------------

router.get('/', authenticateUser, async (req, res) => {
  try {
    const { folderId, search, type, sortBy = 'name', order = 'asc' } = req.query;
    let query = supabase.from('files').select('*').eq('user_id', req.user.id);

    if (folderId && folderId !== 'null') query = query.eq('folder_id', folderId);
    else if (!search) query = query.is('folder_id', null);

    if (search) query = query.ilike('name', `%${search}%`);
    if (type && type !== 'all') query = query.ilike('mime_type', `%${type}%`);

    const sortColumn = sortBy === 'size' ? 'size_bytes' : sortBy;
    query = query.order(sortColumn, { ascending: order === 'asc' });

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { folderId } = req.body;
    const fileExt = req.file.originalname.split('.').pop();
    const filePath = `${req.user.id}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('files')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (uploadError) throw uploadError;

    const { data, error: dbError } = await supabase.from('files').insert([{
      user_id: req.user.id,
      folder_id: folderId === 'null' || !folderId ? null : folderId,
      name: req.file.originalname,
      storage_path: filePath,
      size: req.file.size,
      size_bytes: req.file.size, // Fixed constraint issue
      mime_type: req.file.mimetype
    }]).select().single();

    if (dbError) throw dbError;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/download', authenticateUser, async (req, res) => {
  try {
    const { data: file, error } = await supabase.from('files').select('*').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (error || !file) return res.status(404).json({ error: 'File not found' });

    const { data: signedData, error: signError } = await supabase.storage.from('files').createSignedUrl(file.storage_path, 60, { download: file.name });
    if (signError) throw signError;
    res.json({ downloadUrl: signedData.signedUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/rename', authenticateUser, async (req, res) => {
  try {
    const { name } = req.body;
    const { data, error } = await supabase.from('files').update({ name: name.trim(), updated_at: new Date() }).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/move', authenticateUser, async (req, res) => {
  try {
    const { targetFolderId } = req.body;
    const { data, error } = await supabase.from('files').update({ folder_id: targetFolderId === 'null' ? null : targetFolderId, updated_at: new Date() }).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const { data: file, error: fetchErr } = await supabase.from('files').select('storage_path').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (fetchErr || !file) return res.status(404).json({ error: 'File not found' });

    await supabase.storage.from('files').remove([file.storage_path]);
    await supabase.from('files').delete().eq('id', req.params.id);
    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- USER SHARING ----------------

router.post('/:id/share', authenticateUser, async (req, res) => {
  try {
    const { email, role } = req.body;
    const { data, error } = await supabase.from('file_shares').upsert({ file_id: req.params.id, shared_with_email: email.trim().toLowerCase(), role: role || 'viewer' }).select();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/shares', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase.from('file_shares').select('*').eq('file_id', req.params.id);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/shares/:shareId', authenticateUser, async (req, res) => {
  try {
    const { error } = await supabase.from('file_shares').delete().eq('id', req.params.shareId);
    if (error) throw error;
    res.json({ message: 'Access revoked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- PUBLIC LINKS ----------------

router.post('/:id/public-link', authenticateUser, async (req, res) => {
  try {
    const { expiresInHours, password } = req.body;
    const token = crypto.randomBytes(16).toString('hex');
    let passwordHash = null;
    if (password && password.trim()) passwordHash = await bcrypt.hash(password.trim(), 10);
    
    const expiresAt = expiresInHours ? new Date(Date.now() + Number(expiresInHours) * 3600000).toISOString() : null;
    const { data, error } = await supabase.from('public_links').insert([{ file_id: req.params.id, token, password_hash: passwordHash, expires_at: expiresAt }]).select().single();
    if (error) throw error;
    res.json({ token: data.token, expires_at: data.expires_at, hasPassword: !!password });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/public/access/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    const { data: link, error } = await supabase.from('public_links').select('*, files(*)').eq('token', token).single();
    
    if (error || !link) return res.status(404).json({ error: 'Link is invalid or expired' });
    if (link.expires_at && new Date() > new Date(link.expires_at)) return res.status(410).json({ error: 'This link has expired' });
    
    if (link.password_hash) {
      if (!password) return res.status(401).json({ error: 'Password required', passwordRequired: true });
      const valid = await bcrypt.compare(password, link.password_hash);
      if (!valid) return res.status(403).json({ error: 'Incorrect password' });
    }
    
    const { data: signed } = await supabase.storage.from('files').createSignedUrl(link.files.storage_path, 120, { download: link.files.name });
    res.json({ file: link.files, downloadUrl: signed.signedUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;