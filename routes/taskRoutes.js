import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const taskRoutes = Router();

// Get all tasks (with assigned users)
taskRoutes.get("/", requireAuth, async (req, res, next) => {
  try {
    const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
    
    // Fetch all tasks
    const tasksRes = await query(`
      SELECT t.*, u.name as created_by_name 
      FROM tasks t
      LEFT JOIN users u ON t.created_by = u.id
      ORDER BY t.created_at DESC
    `);
    
    // Fetch assignments for these tasks
    const assignmentsRes = await query(`
      SELECT ta.task_id, u.id as user_id, u.name, u.points
      FROM task_assignments ta
      JOIN users u ON ta.user_id = u.id
    `);

    // Map assignments to tasks
    const tasks = tasksRes.rows.map(task => ({
      ...task,
      assigned_to: assignmentsRes.rows.filter(a => a.task_id === task.id)
    }));

    res.json({ tasks });
  } catch (error) {
    next(error);
  }
});

// Create a new task
taskRoutes.post("/", requireAuth, async (req, res, next) => {
  try {
    const { title, description, priority, department, points_reward, assigned_user_ids } = req.body;
    
    if (!title || !department) {
      return res.status(400).json({ error: "missing_fields", message: "Title and department are required." });
    }

    const userId = req.user?.id || null;

    // Insert task
    const taskRes = await query(`
      INSERT INTO tasks (title, description, priority, department, points_reward, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [title, description, priority || 'medium', department, points_reward || 10, userId]);
    
    const newTask = taskRes.rows[0];

    // Assign users
    const assignments = [];
    if (assigned_user_ids && Array.isArray(assigned_user_ids) && assigned_user_ids.length > 0) {
      for (const uId of assigned_user_ids) {
        await query(`
          INSERT INTO task_assignments (task_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [newTask.id, uId]);
        
        // Fetch user info for response
        const userRes = await query(`SELECT id as user_id, name, points FROM users WHERE id = $1`, [uId]);
        if (userRes.rows.length > 0) {
          assignments.push(userRes.rows[0]);
        }
      }
    }

    res.status(201).json({ 
      success: true, 
      task: { ...newTask, assigned_to: assignments, created_by_name: req.user?.name || req.user?.username } 
    });
  } catch (error) {
    next(error);
  }
});

// Update task status
taskRoutes.put("/:id/status", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const taskRes = await query(`UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`, [status, id]);
    
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: "not_found", message: "Task not found." });
    }

    const updatedTask = taskRes.rows[0];

    // Fetch assignments to return complete task object
    const assignmentsRes = await query(`
      SELECT ta.task_id, u.id as user_id, u.name, u.points
      FROM task_assignments ta
      JOIN users u ON ta.user_id = u.id
      WHERE ta.task_id = $1
    `, [id]);

    // Simple implementation: If task is completed, we could award points here to all assigned users.
    if (status === 'completed') {
      const points = updatedTask.points_reward;
      for (const assignee of assignmentsRes.rows) {
        await query(`UPDATE users SET points = points + $1 WHERE id = $2`, [points, assignee.user_id]);
      }
    }

    res.json({ 
      success: true, 
      task: { ...updatedTask, assigned_to: assignmentsRes.rows } 
    });
  } catch (error) {
    next(error);
  }
});

// Get users by department for task assignment
taskRoutes.get("/users/:dept", requireAuth, async (req, res, next) => {
  try {
    const { dept } = req.params;
    
    let dbQuery = `SELECT id, name, points FROM users WHERE active = TRUE ORDER BY points DESC`;
    let values = [];

    const usersRes = await query(dbQuery, values);
    res.json({ users: usersRes.rows });
  } catch (error) {
    next(error);
  }
});

// Get task comments
taskRoutes.get("/:id/comments", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const commentsRes = await query(`
      SELECT tc.*, u.name as user_name 
      FROM task_comments tc
      LEFT JOIN users u ON tc.user_id = u.id
      WHERE tc.task_id = $1
      ORDER BY tc.created_at ASC
    `, [id]);
    res.json({ comments: commentsRes.rows });
  } catch (error) {
    next(error);
  }
});

// Post a task comment/update
taskRoutes.post("/:id/comments", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { comment, link_url } = req.body;
    const userId = req.user?.id || null;

    if (!comment && !link_url) {
      return res.status(400).json({ error: "missing_fields", message: "Comment or link is required." });
    }

    const commentRes = await query(`
      INSERT INTO task_comments (task_id, user_id, comment, link_url)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [id, userId, comment || "", link_url || null]);

    const newComment = commentRes.rows[0];
    newComment.user_name = req.user?.name || req.user?.username;

    res.status(201).json({ success: true, comment: newComment });
  } catch (error) {
    next(error);
  }
});
