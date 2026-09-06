const express = require('express');
const router = express.Router();
const supabase = require('./supabase');
const { createClient } = require('@supabase/supabase-js');

// Admin client using Service Role Key to bypass email verification limits
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// 1. User Registration Route
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validations
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Please enter a valid name.' });
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email || !emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Admin Create User: Directly creates verified user without triggering confirmation emails
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: name.trim()
      }
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    res.status(201).json({
      message: 'Account created successfully! Please sign in.',
      token: null,
      user: authData.user
    });
  } catch (err) {
    console.error('Registration error details:', err.message || err);
    res.status(500).json({ error: err.message || 'Internal server error during registration' });
  }
});

// 2. User Login Route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: password
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      message: 'Login successful',
      token: data.session.access_token,
      user: data.user
    });
  } catch (err) {
    console.error('Login error details:', err.message || err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

module.exports = router;