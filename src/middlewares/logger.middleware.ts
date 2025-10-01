import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { WebSocketService } from '../services/websocket.service';

// Créer le dossier de logs s'il n'existe pas
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Chemin du fichier de logs
const logFilePath = path.join(logsDir, 'app.log');

/**
 * Middleware pour journaliser les requêtes HTTP
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Capturer la réponse (sans modifier le type Response)
  let responseBody: any;
  const originalSend = res.send;
  res.send = function(body) {
    responseBody = body;
    res.send = originalSend;
    return originalSend.call(this, body);
  };
  
  // Une fois la réponse envoyée
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent') || 'unknown'
    };
    
    // Format de log
    const logEntry = `[${log.timestamp}] ${log.method} ${log.url} ${log.status} ${log.duration} - ${log.ip} - ${log.userAgent}\n`;
    
    // Journaliser dans la console
    if (process.env.NODE_ENV !== 'production') {
      const statusColor = res.statusCode >= 400 ? '\x1b[31m' : res.statusCode >= 300 ? '\x1b[33m' : '\x1b[32m';
      const resetColor = '\x1b[0m';
      console.log(`${statusColor}${logEntry}${resetColor}`);
    }

    // Envoyer aux clients WebSocket
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warning' : 'info';
    WebSocketService.sendLog(logEntry.trim(), logLevel);
    
    // Écrire dans le fichier de logs
    fs.appendFile(logFilePath, logEntry, (err) => {
      if (err) {
        console.error('Erreur lors de l\'écriture dans le fichier de logs:', err);
      }
    });
  });
  
  next();
};

/**
 * Middleware pour journaliser les erreurs
 */
export const errorLogger = (err: any, req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  const errorLog = `[${timestamp}] ERROR: ${err.message}\nStack: ${err.stack}\nRequest: ${req.method} ${req.originalUrl}\n\n`;
  
  // Journaliser dans la console
  console.error('\x1b[31m%s\x1b[0m', errorLog);

  // Envoyer aux clients WebSocket
  WebSocketService.sendLog(errorLog.trim(), 'error');
  
  // Écrire dans le fichier de logs
  fs.appendFile(path.join(logsDir, 'error.log'), errorLog, (err) => {
    if (err) {
      console.error('Erreur lors de l\'écriture dans le fichier de logs d\'erreurs:', err);
    }
  });
  
  next(err);
};
