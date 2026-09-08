const express = require('express');
const Task = require('../models/Tasks');
const auth = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/error');
const { requiredString } = require('../utils/validation');

const router = express.Router();
router.use(auth);

async function listTasks(req, res) {
  const data = await Task.find({ userId: req.user.id }).sort({ completed: 1, createdAt: -1 });
  res.json({ data });
}

router.get('/', asyncHandler(listTasks));
router.get('/get-tasks', asyncHandler(listTasks));

async function addTask(req, res) {
  const task = await Task.create({
    userId: req.user.id,
    taskName: requiredString(req.body.taskName, 'Task name', { min: 2, max: 160 }),
    completed: Boolean(req.body.completed),
  });
  res.status(201).json({ data: task });
}

router.post('/', asyncHandler(addTask));
router.post('/add-task', asyncHandler(addTask));

async function updateTask(req, res) {
  const update = {};
  if (req.body.completed !== undefined) update.completed = Boolean(req.body.completed);
  if (req.body.taskName !== undefined) update.taskName = requiredString(req.body.taskName, 'Task name', { min: 2, max: 160 });
  const task = await Task.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, update, { new: true, runValidators: true });
  if (!task) throw new ApiError(404, 'Task not found.', 'TASK_NOT_FOUND');
  res.json({ data: task });
}

router.patch('/:id', asyncHandler(updateTask));
router.patch('/update/:id', asyncHandler(updateTask));

router.delete('/:id', asyncHandler(async (req, res) => {
  const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  if (!task) throw new ApiError(404, 'Task not found.', 'TASK_NOT_FOUND');
  res.status(204).end();
}));

module.exports = router;
