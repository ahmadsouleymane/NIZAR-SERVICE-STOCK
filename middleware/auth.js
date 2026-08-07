// middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'nizar-stock-secret-key-change-in-production';

// En production, refuser de demarrer sans un secret fort explicite :
// un secret par defaut public permettrait de forger des jetons.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('[SECURITE] Variable d\'environnement JWT_SECRET manquante : configurez un secret fort avant la mise en production (ex: openssl rand -hex 32).');
}

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expire.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acces reserve a l\'administrateur.' });
  }
  next();
}

module.exports = { authenticate, requireAdmin, JWT_SECRET };
