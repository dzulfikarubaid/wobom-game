import prisma from '../prisma.js';
import jwt from 'jsonwebtoken';
import pkg from 'bcryptjs';
const { hashSync, compareSync } = pkg;
import { JWT_SECRET } from '../utilities/secureData.js';

const sendErrorResponse = (res, statusCode, message) => {
    res.status(statusCode).json({ error: message });
};
async function signup(req, res) {
    const { username, password } = req.body;

    try {
        // Validate input
        if (!username || !password) {
            return sendErrorResponse(res, 400, 'username and password are required');
        }

        const existingUser = await prisma.user.findFirst({ where: { username } });
        if (existingUser) {
            return sendErrorResponse(res, 409, 'User already exists');
        }

        const newUser = await prisma.user.create({
            data: {
                username,
                password: hashSync(password, 10),
            },
        });
        const token = jwt.sign({ id: newUser.id, username: username }, JWT_SECRET, { expiresIn: '120h' });
        res.cookie('token', token, { httpOnly: true, maxAge: 5 * 24 * 60 * 60 * 1000 })
        res.status(201).json({ message: 'User registered successfully', user: newUser, token });
    } catch (error) {
        console.error('Registration error:', error);
        sendErrorResponse(res, 500, 'Internal server error');
    }
}

async function signin(req, res) {
    const { username, password } = req.body;

    try {
        if (!username || !password) {
            return sendErrorResponse(res, 400, 'username and password are required');
        }
        const user = await prisma.user.findFirst({ where: { username } });
        if (!user) {
            return sendErrorResponse(res, 404, 'username is not registered');
        }
        if (!compareSync(password, user.password)) {
            return sendErrorResponse(res, 401, 'Invalid password');
        }
        const token = jwt.sign({ id: user.id, username: username }, JWT_SECRET, { expiresIn: '120h' });
        res.cookie('token', token, { httpOnly: true, maxAge: 5 * 24 * 60 * 60 * 1000 })
        res.status(200).json({ message: 'Login successful', user, token });
    } catch (error) {
        console.error('Login error:', error);
        sendErrorResponse(res, 500, 'Internal server error');
    }
}
async function signout(req, res) {
    res.clearCookie('token')
    res.json({ message: 'Signout successful' })
}

async function getUser(req, res) {
    try {
        const cookie = req.cookies['token'];
        if (!cookie) {
            return res.status(401).json({ message: 'Unauthorized: No token' });
        }

        const claims = jwt.verify(cookie, JWT_SECRET);

        const user = await prisma.user.findUnique({ where: { id: claims.id } });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const { password, ...data } = user; // Exclude password from response
        res.status(200).json(data);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired' });
        }
        console.error('Error in getUser:', error);
        return res.status(401).json({ message: 'Unauthorized' });
    }
}


export { signup, signin, getUser, signout };