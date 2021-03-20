const passport = require('passport')
const TwitterTokenStrategy = require('passport-twitter-token')
const twitterConfig = require('./twitterConfig')
const db = require('./db')

module.exports = function () {
  passport.use(new TwitterTokenStrategy({
      consumerKey: twitterConfig.consumerKey,
      consumerSecret: twitterConfig.consumerSecret,
      includeEmail: true
    },
    function (token, tokenSecret, profile, done) {
      db.upsertTwitterUser(token, tokenSecret, profile)
        .then((user) => done(null, user))
        .catch((err) => done(err, null))
    }))
}
