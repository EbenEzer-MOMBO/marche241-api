import { Router } from 'express';
import { BilletController } from '../controllers/billet.controller';

const router = Router();

router.get('/:jeton', BilletController.telechargerParJeton);

export default router;
