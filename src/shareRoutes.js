const express = require('express');
const router = express.Router();
const supabase = require('./supabase');
const crypto = require('crypto');

// 1. Internal User Share Add karna (Authentication required)
router.post('/file/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const { email, role } = req.body;

  try {
    const { data, error } = await supabase
      .from('file_shares')
      .insert([{ file_id: fileId, shared_with_email: email, role: role || 'viewer' }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. File ke active user shares fetch karna
router.get('/file/:fileId', async (req, res) => {
  const { fileId } = req.params;
  try {
    const { data, error } = await supabase
      .from('file_shares')
      .select('*')
      .eq('file_id', fileId);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. User share access revoke karna
router.delete('/:shareId', async (req, res) => {
  const { shareId } = req.params;
  try {
    const { error } = await supabase
      .from('file_shares')
      .delete()
      .eq('id', shareId);

    if (error) throw error;
    res.json({ message: 'Share revoked successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Create Public Link
router.post('/public-link/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const { expiresInHours, password } = req.body;

  try {
    const token = crypto.randomBytes(16).toString('hex');
    let expiresAt = null;
    if (expiresInHours) {
      expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
    }

    const { data, error } = await supabase
      .from('public_links')
      .insert([{
        file_id: fileId,
        token: token,
        password: password || null,
        expires_at: expiresAt
      }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Public Access Route (Outsiders ke liye token verify karke download url dena)
router.get('/public/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.query;

  try {
    const { data: linkData, error: linkErr } = await supabase
      .from('public_links')
      .select('*, files(*)')
      .eq('token', token)
      .single();

    if (linkErr || !linkData) {
      return res.status(404).json({ error: 'Link expired or invalid' });
    }

    if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This link has expired' });
    }

    if (linkData.password && linkData.password !== password) {
      return res.status(401).json({ requiresPassword: true, error: 'Password required or incorrect' });
    }

    const file = linkData.files;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Signed download url create karna
    const { data: signData, error: signErr } = await supabase
      .storage
      .from('cloudbox-files')
      .createSignedUrl(file.storage_path || file.name, 3600);

    const downloadUrl = signData?.signedUrl || file.storage_path;

    res.json({
      file: file,
      downloadUrl: downloadUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
// Public Download Route (Direct Stream / Trigger Download without login)
router.get('/public/:token/download', async (req, res) => {
  const { token } = req.params;
  const { password } = req.query;

  try {
    const { data: linkData, error: linkErr } = await supabase
      .from('public_links')
      .select('*, files(*)')
      .eq('token', token)
      .single();

    if (linkErr || !linkData) {
      return res.status(404).json({ error: 'Link expired or invalid' });
    }

    if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This link has expired' });
    }

    if (linkData.password && linkData.password !== password) {
      return res.status(401).json({ error: 'Password required or incorrect' });
    }

    const file = linkData.files;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Supabase storage se file download stream karein
    const { data, error } = await supabase
      .storage
      .from('cloudbox-files')
      .download(file.storage_path || file.name);

    if (error) throw error;

    // Buffer read karke seedha download headers set karein
    const buffer = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.send(buffer);
  } catch (err) {
    console.error('Public download error:', err);
    res.status(500).json({ error: err.message });
  }
});