const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('./supabase');

// 1. Share via Email with Role (Viewer / Editor)
router.post('/add', async (req, res) => {
  try {
    const { resourceType, resourceId, granteeEmail, role, createdBy, resourceName } = req.body;
    if (!resourceId || !granteeEmail) {
      return res.status(400).json({ error: 'Missing required share fields' });
    }

    const { data, error } = await supabase
      .from('shares')
      .insert([{
        resource_type: resourceType || 'file',
        resource_id: resourceId,
        grantee_email: granteeEmail.trim().toLowerCase(),
        role: role || 'viewer',
        created_by: createdBy
      }])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    await supabase.from('activities').insert([{
      actor_id: createdBy,
      action: 'share',
      resource_name: resourceName || 'file'
    }]);

    res.status(201).json({ message: 'User access granted', share: data[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error while sharing' });
  }
});

// 2. Generate Public Link Share with Token & Expiry
router.post('/link', async (req, res) => {
  try {
    const { fileId, role, expiresDays, createdBy } = req.body;
    const token = crypto.randomBytes(16).toString('hex');
    
    let expiresAt = null;
    if (expiresDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(expiresDays));
    }

    const { data, error } = await supabase
      .from('link_shares')
      .insert([{
        resource_type: 'file',
        resource_id: fileId,
        token: token,
        role: role || 'viewer',
        expires_at: expiresAt,
        created_by: createdBy
      }])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ 
      message: 'Share link generated', 
      token: token,
      shareUrl: `${req.protocol}://${req.get('host')}/shared/${token}` 
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error generating link share' });
  }
});

// 3. Activity audit logs
router.get('/activities/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('actor_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

module.exports = router;