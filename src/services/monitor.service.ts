import axios from 'axios';

export class MonitorService {
  private static interval: NodeJS.Timeout | null = null;
  private static lastPingTime: Date | null = null;
  private static startTime: Date = new Date();

  static initialize(appUrl: string) {
    if (process.env.NODE_ENV === 'production') {
      console.log('[MonitorService] Initialisation du service de monitoring...');
      
      // Premier ping immédiat
      this.pingServer(appUrl);

      // Ping toutes les 14 minutes (840000 ms)
      this.interval = setInterval(() => this.pingServer(appUrl), 840000);

      console.log('[MonitorService] Service de monitoring initialisé avec succès');
      console.log(`[MonitorService] URL de l'application: ${appUrl}`);
      console.log('[MonitorService] Intervalle: 14 minutes');
    }
  }

  private static async pingServer(appUrl: string) {
    try {
      const startTime = Date.now();
      const response = await axios.get(`${appUrl}/health`);
      const duration = Date.now() - startTime;

      this.lastPingTime = new Date();
      
      console.log(`[MonitorService] Health check réussi à ${this.lastPingTime.toISOString()}`);
      console.log(`[MonitorService] Temps de réponse: ${duration}ms`);
      console.log(`[MonitorService] Uptime serveur: ${this.formatUptime(process.uptime())}`);
      
      if (response.data.memory) {
        console.log(`[MonitorService] Utilisation mémoire: ${Math.round(response.data.memory.heapUsed / 1024 / 1024)}MB`);
      }
    } catch (error: any) {
      console.error('[MonitorService] Échec du health check:', error.message);
      
      // Réessayer dans 1 minute en cas d'échec
      setTimeout(() => this.pingServer(appUrl), 60000);
    }
  }

  private static formatUptime(uptime: number): string {
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}j`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ');
  }

  static getStatus() {
    return {
      startTime: this.startTime,
      lastPingTime: this.lastPingTime,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      isActive: !!this.interval
    };
  }

  static cleanup() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[MonitorService] Service de monitoring arrêté');
    }
  }
}
