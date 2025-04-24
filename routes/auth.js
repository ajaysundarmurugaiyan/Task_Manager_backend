const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, checkRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const Task = require('../models/Task');
const Attendance = require('../models/Attendance');

// Register new user (admin only)
router.post('/register', auth, checkRole(['admin']), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create new user
    const user = new User({
      name,
      email,
      password,
      role: role || 'user'
    });

    // Save user to database
    await user.save();
    console.log('User created successfully:', user._id);

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error in user registration:', error);
    res.status(400).json({ error: error.message });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all users (admin only)
router.get('/users', auth, checkRole(['admin']), async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get specific user (admin only)
router.get('/users/:userId', auth, checkRole(['admin']), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete user (admin only)
router.delete('/users/:userId', auth, checkRole(['admin']), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Task operations
router.post('/users/:userId/tasks', auth, checkRole(['admin']), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const task = {
      title: req.body.title,
      description: req.body.description,
      status: 'pending',
      createdAt: new Date()
    };

    user.tasks.push(task);
    await user.save();

    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.patch('/users/:userId/tasks/:taskId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const task = user.tasks.id(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if user has permission to update this task
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.userId) {
      return res.status(403).json({ error: 'Not authorized to update this task' });
    }

    task.status = req.body.status;
    task.completionNotes = req.body.completionNotes;
    await user.save();

    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/me/tasks/:taskId/accept', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const task = user.tasks.id(req.params.taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    task.status = 'accepted';
    await user.save();

    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/users/:userId/tasks/:taskId', auth, checkRole(['admin']), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const task = user.tasks.id(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    task.remove();
    await user.save();

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Attendance operations
router.get('/attendance', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const users = await User.find({}, 'name attendance');
    
    const attendanceData = users.map(user => ({
      userId: user._id,
      name: user.name,
      date: date,
      status: user.attendance.find(a => 
        new Date(a.date).toISOString().split('T')[0] === date
      )?.status || 'absent'
    }));

    res.json(attendanceData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/me/attendance', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const attendanceData = user.attendance.map(record => ({
      _id: record._id,
      date: new Date(record.date).toISOString().split('T')[0],
      status: record.status
    }));

    res.json(attendanceData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/me/attendance', auth, async (req, res) => {
  try {
    const { date } = req.body;
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if attendance already exists for this date
    const existingAttendance = user.attendance.find(a => 
      new Date(a.date).toISOString().split('T')[0] === date
    );

    if (existingAttendance) {
      return res.status(400).json({ error: 'Attendance already marked for this date' });
    }

    user.attendance.push({
      date: new Date(date),
      status: 'present'
    });

    await user.save();
    res.status(201).json(user.attendance[user.attendance.length - 1]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/me/tasks', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tasks = user.tasks.map(task => ({
      ...task.toObject(),
      createdAt: new Date(task.createdAt).toISOString()
    }));

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/users/:userId/tasks', auth, checkRole(['admin']), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tasks = user.tasks.map(task => ({
      ...task.toObject(),
      createdAt: new Date(task.createdAt).toISOString()
    }));

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create default admin user
router.post('/create-admin', async (req, res) => {
  try {
    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin user already exists' });
    }

    // Create admin user with new credentials
    const adminUser = new User({
      name: 'Admin User',
      email: 'vijay@test.ac.in',  // Changed admin email
      password: 'vijay123',      // Changed admin password
      role: 'admin'
    });

    await adminUser.save();

    res.status(201).json({
      message: 'Admin user created successfully',
      user: {
        id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update task status
router.patch('/me/tasks/:taskId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const task = user.tasks.id(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { status, completionNotes } = req.body;
    task.status = status;
    if (completionNotes) {
      task.completionNotes = completionNotes;
    }

    await user.save();
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Accept task
router.post('/me/tasks/:taskId/accept', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const task = user.tasks.id(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.status !== 'pending') {
      return res.status(400).json({ error: 'Task is not in pending status' });
    }

    task.status = 'accepted';
    await user.save();
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all attendance records (admin only)
router.delete('/attendance/clear', auth, checkRole(['admin']), async (req, res) => {
  try {
    // First, get all users
    const users = await User.find({});
    
    // Clear attendance array for each user
    for (const user of users) {
      user.attendance = [];
    }
    
    // Save all users
    await Promise.all(users.map(user => user.save()));
    
    res.json({ 
      message: 'All attendance records cleared successfully',
      modifiedCount: users.length
    });
  } catch (error) {
    console.error('Error clearing attendance:', error);
    res.status(500).json({ error: 'Failed to clear attendance records' });
  }
});

module.exports = router; 
