import { Router } from 'express';
import { sendMail } from '../services/mailer.service.js'
import { apiRateLimiter } from '../middleware/rate-limit.middleware.js';
import { auth } from '../middleware/auth.middleware.js'

const router = Router();

router.post('/', auth, apiRateLimiter, async (req, res) => {
    try {
        const { name, subject, body } = req.body;
        const sendBody = `Message from: ${ name } \n ${body}`;
        await sendMail(process.env.EMAIL_USER, subject, sendBody);
        res.status(200).json({
            message: 'Mail successfuly sended'
        });
    } catch (error) {
        res.status(500).json({
            message: error.message
        })
    }
});

export default router;