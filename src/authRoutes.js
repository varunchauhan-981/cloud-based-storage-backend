const express = require('express');
const router = express.Router();
const supabase = require('./supabase');

// Sign Up Route
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });

    if (error) return res.status(400).json({ error: error.message });

    // Profile table me record add karna
    if (data.user) {
      await supabase.from('profiles').insert([
        { id: data.user.id, email, full_name: fullName }
      ]);
    }

    res.status(201).json({ message: 'User registered successfully', user: data.user });
  } catch (err) {
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// Login Route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) return res.status(400).json({ error: error.message });

    res.json({
      message: 'Login successful',
      token: data.session?.access_token,
      user: data.user
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;
