const passport = require('passport')
const TwitterTokenStrategy = require('passport-twitter-token')
const twitterConfig = require('./twitterConfig')

module.exports = function () {
  passport.use(new TwitterTokenStrategy({
      consumerKey: twitterConfig.consumerKey,
      consumerSecret: twitterConfig.consumerSecret,
      includeEmail: true
    },
    function (token, tokenSecret, profile, done) {
      console.log(token, tokenSecret, profile, done)
      // TODO: replace with leveldb logic
      User.upsertTwitterUser(token, tokenSecret, profile, function(err, user) {
        return done(err, user)
      })
    }))
}
