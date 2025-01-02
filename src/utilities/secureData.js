import dotenv from 'dotenv';
dotenv.config();
const PORT = process.env.PORT;
const JWT_SECRET = process.env.JWT_SECRET
export { PORT, JWT_SECRET };

