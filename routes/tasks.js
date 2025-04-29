const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const User = require('../models/User');
const { auth, checkRole } = require('../middleware/auth');

// Create and assign task (admin only)
router.post('/', auth, checkRole(['admin']), async (req, res) => {
  try {
    const { title, description, assignedTo, status } = req.body;

    // Check if user exists
    const user = await User.findById(assignedTo);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create task
    const task = new Task({
      title,
      description,
      assignedTo,
      assignedBy: req.user._id,
      status: status || 'pending'
    });

    await task.save();

    // Add task to user's tasks array
    user.tasks.push(task._id);
    await user.save();

    // Populate the response with user details
    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email');

    res.status(201).json(populatedTask);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all tasks (admin only)
router.get('/all', auth, checkRole(['admin']), async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get user's tasks
router.get('/user/me', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ assignedTo: req.user._id })
      .populate('assignedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get tasks for a specific user (admin only)
router.get('/user/:userId', auth, checkRole(['admin']), async (req, res) => {
  try {
    const tasks = await Task.find({ assignedTo: req.params.userId })
      .populate('assignedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update task status
router.patch('/:taskId/status', auth, async (req, res) => {
  try {
    const { status, completionNotes } = req.body;
    const task = await Task.findById(req.params.taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if user is authorized to update this task
    if (task.assignedTo.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to update this task' });
    }

    task.status = status;
    if (completionNotes) {
      task.completionNotes = completionNotes;
    }
    if (status === 'completed') {
      task.completedAt = new Date();
    }

    await task.save();

    // Return populated task
    const updatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email');

    res.json(updatedTask);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Accept task
router.post('/:taskId/accept', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if user is authorized to accept this task
    if (task.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to accept this task' });
    }

    task.status = 'in_progress';
    await task.save();

    // Return populated task
    const updatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email');

    res.json(updatedTask);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete task (admin only)
router.delete('/:taskId', auth, checkRole(['admin']), async (req, res) => {
  try {
    console.log('Attempting to delete task:', req.params.taskId);
    
    const task = await Task.findById(req.params.taskId);
    if (!task) {
      console.log('Task not found:', req.params.taskId);
      return res.status(404).json({ error: 'Task not found' });
    }

    console.log('Found task:', task._id);

    // Remove task from user's tasks array if assigned
    if (task.assignedTo) {
      await User.findByIdAndUpdate(task.assignedTo, {
        $pull: { tasks: task._id }
      });
    }

    // Delete the task
    const deletedTask = await Task.findByIdAndDelete(req.params.taskId);
    console.log('Deleted task:', deletedTask._id);

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router; 