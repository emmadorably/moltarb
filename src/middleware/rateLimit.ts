import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 10 * 60 * 1000);

function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] as string ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/**
 * Rate limit by IP address.
 * @param max - Max requests per window
 * @param windowMs - Window in milliseconds
 */
export function ipRateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: `Rate limit exceeded. Max ${max} per ${windowMs / 60000} minutes. Try again in ${retryAfter}s.`,
      });
    }

    entry.count++;
    next();
  };
}
