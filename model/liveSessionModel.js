const mongoose = require('mongoose');

const liveSessionSchema = new mongoose.Schema({
    courseId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Course', 
        required: true 
    },
    tutorId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    title: { 
        type: String, 
        required: true 
    },
    description: { 
        type: String 
    },
    scheduledDateTime: { 
        type: Date, 
        required: true 
    },
    duration: { 
        type: Number, // in minutes
        required: true,
        default: 60 
    },
    status: { 
        type: String, 
        enum: ['scheduled', 'live', 'completed', 'cancelled'],
        default: 'scheduled' 
    },
    roomId: { 
        type: String, 
        unique: true,
        required: true 
    },
    maxParticipants: { 
        type: Number, 
        default: 100 
    },
    participants: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joinedAt: { type: Date },
        leftAt: { type: Date }
    }],
    recordingUrl: { 
        type: String // URL to recorded session if recorded
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
});

// Update the updatedAt field before saving
liveSessionSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const LiveSession = mongoose.model('LiveSession', liveSessionSchema);

module.exports = LiveSession;