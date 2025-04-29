const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const { auth, checkRole } = require('../middleware/auth');

// Mark attendance (user only)
router.post('/', auth, async (req, res) => {
  try {
    const { date } = req.body;
    
    // Check if attendance already exists for this date
    const existingAttendance = await Attendance.findOne({
      user: req.user._id,
      date: new Date(date)
    });

    if (existingAttendance) {
      return res.status(400).json({ error: 'Attendance already marked for this date' });
    }

    const attendance = new Attendance({
      user: req.user._id,
      date: new Date(date),
      status: 'present'
    });

    await attendance.save();
    res.status(201).json(attendance);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get attendance for a specific date (admin only)
router.get('/', auth, checkRole(['admin']), async (req, res) => {
  try {
    const { date } = req.query;
    const attendance = await Attendance.find({ date: new Date(date) })
      .populate({
        path: 'user',
        select: 'name email',
        options: { lean: true }
      })
      .sort({ date: -1 });

    // Filter out attendance records for deleted users
    const validAttendance = attendance.filter(record => record.user !== null);
    
    res.json(validAttendance);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get user's own attendance
router.get('/my', auth, async (req, res) => {
  try {
    const attendance = await Attendance.find({ user: req.user._id })
      .sort({ date: -1 });
    res.json(attendance);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router; 