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

export function optionalAuth(req, res, next) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return next();

  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (err) {}
  return next();
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

export function requireHubAccess(hub, tab) {
  return (req, res, next) => {
    const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
    if (roles.includes("superadmin")) {
      return next();
    }
    
    const perms = req.user?.merged_permissions || {};
    const hubPerms = perms.hubs?.[hub] || [];
    
    if (hubPerms.includes("*") || hubPerms.includes(tab)) {
      return next();
    }
    
    return res.status(403).json({ 
      error: "hub_access_denied", 
      message: `Access denied. Requires '${tab}' access in '${hub}' hub.` 
    });
  };
}

export function requireEventAccess(capability = null) {
  return (req, res, next) => {
    const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
    if (roles.includes("superadmin")) {
      return next();
    }

    const perms = req.user?.merged_permissions?.events || {};
    const slug = req.params.slug;
    if (!slug) return next();

    const eventPerms = perms["*"] || perms[slug];
    if (eventPerms) {
      if (!capability) return next(); // Just needs basic event access
      
      if (Array.isArray(eventPerms) && (eventPerms.includes("*") || eventPerms.includes(capability))) {
        return next();
      }
      
      return res.status(403).json({
        error: "event_capability_denied",
        message: `Access denied. Missing capability '${capability}' for event '${slug}'.`
      });
    }

    return res.status(403).json({
      error: "event_access_denied",
      message: `Access denied. You do not have permission for event '${slug}'.`
    });
  };
}
