const jwt = require('jsonwebtoken')

function createToken(auth) {
  return jwt.sign({
    id: auth.id
  }, 'my-secret',
    {
      expiresIn: 60 * 120
    })
}
function generateToken(req, res, next) {
  req.token = createToken(req.auth)
  return next()
}

function sendToken(req, res) {
  res.setHeader('x-auth-token', req.token)
  return res.status(200).send(JSON.stringify(req.user))
}

module.exports = {
  createToken,
  generateToken,
  sendToken
}
