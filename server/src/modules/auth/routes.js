// AuthModule (owner: Arushi). Base path: /api/v1/auth
const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { sendVerificationEmail } = require('./mockEmail');

function createAuthRouter({
	db = pool,
	authMiddleware = authenticate,
	mailer = sendVerificationEmail,
	jwtSecret = () => process.env.JWT_SECRET,
	jwtExpiresIn = () => process.env.JWT_EXPIRES_IN || '1h',
} = {}) {
	const router = express.Router();

	router.post('/register', async (req, res, next) => {
		const body = req.body || {};
		const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
		const password = body.password;
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 8) {
			return res.status(400).json({ error: 'A valid email and password of at least 8 characters are required' });
		}

		try {
			const passwordHash = await bcrypt.hash(password, 12);
			const result = await db.query(
				'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, email_verified',
				[email, passwordHash],
			);
			const user = result.rows[0];
			const verificationToken = crypto.randomBytes(32).toString('hex');
			const tokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
			await db.query(
				`INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
				 VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
				[user.id, tokenHash],
			);
			await mailer({
				to: user.email,
				verificationUrl: `${req.protocol}://${req.get('host')}/api/v1/auth/verify-email?token=${verificationToken}`,
			});
			return res.status(201).json({
				user: { id: user.id, email: user.email, emailVerified: user.email_verified },
				message: 'Account created. Check your email for a verification link.',
			});
		} catch (error) {
			if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
			return next(error);
		}
	});

	router.get('/verify-email', async (req, res, next) => {
		const token = typeof req.query.token === 'string' ? req.query.token : '';
		if (!token) return res.status(400).json({ error: 'A verification token is required' });

		try {
			const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
			const result = await db.query(
				`WITH consumed AS (
					 UPDATE email_verification_tokens
					 SET used_at = NOW()
					 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
					 RETURNING user_id
				 )
				 UPDATE users
				 SET email_verified = TRUE
				 FROM consumed
				 WHERE users.id = consumed.user_id
				 RETURNING users.id, users.email`,
				[tokenHash],
			);
			if (!result.rows[0]) return res.status(400).json({ error: 'Verification link is invalid or expired' });
			return res.json({ message: 'Email verified' });
		} catch (error) {
			return next(error);
		}
	});

	router.post('/login', async (req, res, next) => {
		const body = req.body || {};
		const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
		const password = body.password;
		if (!email || typeof password !== 'string') {
			return res.status(400).json({ error: 'Email and password are required' });
		}

		try {
			const result = await db.query(
				'SELECT id, email, password_hash, role, status FROM users WHERE email = $1',
				[email],
			);
			const user = result.rows[0];
			if (!user || !(await bcrypt.compare(password, user.password_hash))) {
				return res.status(401).json({ error: 'Invalid email or password' });
			}
			if (user.status !== 'ACTIVE') return res.status(403).json({ error: 'Account is disabled' });
			if (!jwtSecret()) return res.status(500).json({ error: 'Authentication is not configured' });

			const tokenId = crypto.randomUUID();
			const token = jwt.sign({ role: user.role }, jwtSecret(), {
				subject: String(user.id),
				jwtid: tokenId,
				expiresIn: jwtExpiresIn(),
			});
			const expiresAt = new Date(jwt.decode(token).exp * 1000);
			await db.query(
				'INSERT INTO auth_sessions (token_id, user_id, expires_at) VALUES ($1, $2, $3)',
				[tokenId, user.id, expiresAt],
			);
			return res.json({ token, expiresIn: jwtExpiresIn() });
		} catch (error) {
			return next(error);
		}
	});

	router.post('/logout', authMiddleware, async (req, res, next) => {
		try {
			await db.query(
				'UPDATE auth_sessions SET revoked_at = NOW() WHERE token_id = $1 AND user_id = $2 AND revoked_at IS NULL',
				[req.authTokenId, req.user.id],
			);
			return res.json({ message: 'Logged out' });
		} catch (error) {
			return next(error);
		}
	});

	router.post('/password-reset/request', (req, res) => res.status(501).json({ error: 'TM-F-004 is planned for Sprint 2' }));
	router.post('/password-reset/confirm', (req, res) => res.status(501).json({ error: 'TM-F-004 is planned for Sprint 2' }));

	return router;
}

const router = createAuthRouter();
router.createAuthRouter = createAuthRouter;

module.exports = router;
