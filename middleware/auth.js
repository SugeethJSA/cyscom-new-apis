import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-this-jwt-secret";

export function signUser(user) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "12h" });
}

export function requireAuth(req, res, next) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    return res.status(401).json({ error: "missing_token", message: "Login is required." });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ error: "invalid_token", message: "Session expired or invalid." });
  }
}

export function requireAdmin(req, res, next) {
  const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
  if (!roles.includes("admin") && !roles.includes("superadmin")) {
    return res.status(403).json({ error: "admin_required", message: "Admin access is required." });
  }
  return next();
}

export function requireSuperAdmin(req, res, next) {
  const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
  if (!roles.includes("superadmin")) {
    return res.status(403).json({ error: "superadmin_required", message: "Superadmin access is required." });
  }
  return next();
}

export function requirePermission(permission) {
  return (req, res, next) => {
    const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
    const permissions = req.user?.permissions || [];
    
    // Superadmins override everything
    if (roles.includes("superadmin")) {
      return next();
    }
    
    // Check if user has specific permission
    if (permissions.includes(permission)) {
      return next();
    }
    
    return res.status(403).json({ 
      error: "permission_denied", 
      message: `Access denied. Requires '${permission}' permission or Superadmin role.` 
    });
  };
}

export function requireDepartment(department) {
  return (req, res, next) => {
    const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
    const depts = Array.isArray(req.user?.departments) ? req.user.departments : [req.user?.department].filter(Boolean);
    
    if (roles.includes("superadmin")) {
      return next();
    }
    
    if (depts.includes(department)) {
      return next();
    }
    
    return res.status(403).json({ 
      error: "department_denied", 
      message: `Access denied. Requires access to department '${department}'.` 
    });
  };
}
