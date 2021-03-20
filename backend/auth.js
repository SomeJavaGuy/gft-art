const jwt = require('jsonwebtoken')

module.exports = {
  createToken: function (auth) {
    return jwt.sign({
      id: auth.id
    }, 'my-secret',
      {
        expiresIn: 60 * 120
      })
  },
  generateToken: function (req, res, next) {
    req.token = this.createToken(req.auth)
    return next()
  },

  sendToken: function (req, res) {
    res.setHeader('x-auth-token', req.token)
    return res.status(200).send(JSON.stringify(req.user))
  }
}
