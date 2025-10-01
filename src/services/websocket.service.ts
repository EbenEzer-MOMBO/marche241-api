import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';

export class WebSocketService {
  private static wss: WebSocketServer;
  private static clients: Set<WebSocket> = new Set();

  static initialize(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/logs' });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('🔌 Nouvelle connexion WebSocket établie');
      this.clients.add(ws);

      ws.on('close', () => {
        console.log('🔌 Connexion WebSocket fermée');
        this.clients.delete(ws);
      });

      // Envoyer un message de bienvenue
      this.sendLog('Connexion établie au serveur de logs', 'success');
    });
  }

  static sendLog(message: string, level: 'info' | 'error' | 'warning' | 'success' = 'info') {
    const logMessage = JSON.stringify({
      timestamp: new Date().toISOString(),
      message,
      level
    });

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(logMessage);
      }
    });
  }
}
