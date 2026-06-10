import { Request, Response, NextFunction } from 'express'

export function createAuthMiddleware(token: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization

    if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== token) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    next()
  }
}
