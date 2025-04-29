const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    index: true
  },
  date: {
    type: Date,
    required: [true, 'Attendance date is required'],
    validate: {
      validator: function(value) {
        // Ensure date is not in the future
        return value <= new Date();
      },
      message: 'Attendance date cannot be in the future'
    },
    index: true
  },
  status: {
    type: String,
    enum: {
      values: ['present', 'absent', 'half-day', 'leave'],
      message: 'Invalid attendance status'
    },
    default: 'present',
    required: [true, 'Attendance status is required']
  },
  checkInTime: {
    type: Date,
    validate: {
      validator: function(value) {
        return !this.checkOutTime || value < this.checkOutTime;
      },
      message: 'Check-in time must be before check-out time'
    }
  },
  checkOutTime: {
    type: Date,
    validate: {
      validator: function(value) {
        return !this.checkInTime || value > this.checkInTime;
      },
      message: 'Check-out time must be after check-in time'
    }
  },
  workHours: {
    type: Number,
    min: [0, 'Work hours cannot be negative'],
    max: [24, 'Work hours cannot exceed 24']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure unique attendance records per user per date
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

// Index for location-based queries
attendanceSchema.index({ location: '2dsphere' });

// Pre-save middleware to calculate work hours
attendanceSchema.pre('save', function(next) {
  if (this.checkInTime && this.checkOutTime) {
    this.workHours = (this.checkOutTime - this.checkInTime) / (1000 * 60 * 60); // Convert to hours
  }
  next();
});

// Query middleware to populate user details
attendanceSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'user',
    select: 'name email'
  });
  next();
});

// Static method to get attendance statistics
attendanceSchema.statics.getAttendanceStats = async function(userId, startDate, endDate) {
  return await this.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgWorkHours: { $avg: '$workHours' },
        totalWorkHours: { $sum: '$workHours' }
      }
    }
  ]);
};

// Method to check if user can mark attendance
attendanceSchema.methods.canMarkAttendance = function() {
  const now = new Date();
  return this.date.toDateString() === now.toDateString() && !this.checkOutTime;
};

const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = Attendance; 