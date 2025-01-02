import {signup, signin, getUser, signout} from '../controllers/userControllers.js'
import express from 'express'

const routes = express.Router()
routes.get('/', (req, res) => {
    res.send('Welcome to the user routes')
})
routes.post('/user/signup', signup)
routes.post('/user/signin', signin)
routes.get('/user/signout', signout)
// routes.get('/user/protected', authenticate, (req, res) => {
//     res.json({ message: 'Access granted', user: req.user, access: true });
// });
routes.get('/user', getUser)

export default routes