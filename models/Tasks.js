const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    completed: { type: Boolean, default: false, required: true },
    taskName: { type: String, required: true, trim: true, maxlength: 160 }
}, { timestamps: true });

module.exports = mongoose.model('Task', TaskSchema);
