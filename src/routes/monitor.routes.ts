import { Router } from 'express';
import { MonitorService } from '../services/monitor.service';

const router = Router();

// Route de health check pour le monitoring
router.get('/health', (req, res) => {
  const status = MonitorService.getStatus();
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    monitor: {
      lastPing: status.lastPingTime,
      isActive: status.isActive
    }
  });
});

export default router;
