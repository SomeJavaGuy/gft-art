const assert = require('assert')
const express = require('express')
const passport = require('passport')
const jwt = require('jsonwebtoken')
const expressJwt = require('express-jwt')
const cors = require('cors')
const bodyParser = require('body-parser')
const request = require('request')
const morgan = require('morgan')
require('dotenv').config()
const { generateToken, sendToken } = require('./auth')
const db = require('./db')
const configurePassport = require('./passport.js')
const twitterConfig = require('./twitterConfig.js')


const PORT = 4000

const router = express.Router()

configurePassport()

const app = express()

app.set('trust proxy', true)

/* CORS */

const corsOption = {
  origin: ['*', /http:\/\/localhost:\d+/, /\*.gft.art/],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  exposedHeaders: ['x-auth-token']
}
app.use(cors(corsOption))

/* PARSERS */

app.use(bodyParser.urlencoded({
  extended: true
}))
app.use(bodyParser.json())

/* LOGGING */

app.use(morgan('combined'))

/* ROUTES */

app.get('/', (req, res) => {
  res.send('Alive')
})

router.route('/auth/twitter/reverse')
  .post(function (req, res) {
    request.post({
      url: 'https://api.twitter.com/oauth/request_token',
      oauth: {
        oauth_callback: "http%3A%2F%2Flocalhost%3A3000%2Ftwitter-callback",
        consumer_key: twitterConfig.consumerKey,
        consumer_secret: twitterConfig.consumerSecret
      }
    }, function (err, r, body) {
      if (err) {
        return res.send(500, { message: err.message })
      }

      var jsonStr = '{ "' + body.replace(/&/g, '", "').replace(/=/g, '": "') + '"}'
      res.send(JSON.parse(jsonStr))
    })
  })

router.route('/auth/twitter')
  .post((req, res, next) => {
    request.post({
      url: `https://api.twitter.com/oauth/access_token?oauth_verifier`,
      oauth: {
        consumer_key: twitterConfig.consumerKey,
        consumer_secret: twitterConfig.consumerSecret,
        token: req.query.oauth_token
      },
      form: { oauth_verifier: req.query.oauth_verifier }
    }, function (err, r, body) {
      if (err) {
        return res.send(500, { message: err.message })
      }

      const bodyString = '{ "' + body.replace(/&/g, '", "').replace(/=/g, '": "') + '"}'
      const parsedBody = JSON.parse(bodyString)

      req.body['oauth_token'] = parsedBody.oauth_token
      req.body['oauth_token_secret'] = parsedBody.oauth_token_secret
      req.body['user_id'] = parsedBody.user_id

      next();
    });
  }, passport.authenticate('twitter-token', { session: false }), function (req, res, next) {
    if (!req.user) {
      return res.send(401, 'User Not Authenticated');
    }

    req.auth = {
      id: req.user.id
    }

    return next();
  }, generateToken, sendToken)

router.get('/gft/twitter/recipients/:username', passport.authenticate('twitter-token', { session: false }), function (req, res) {
  const username = req.user?.profile.username

  if (req.params.username != username) {
    return res.sendStatus(401)
  }

  db.getTwitterRecipientGfts(username).then((data) => {
    res.send(JSON.stringify(data))
  })
    .catch((err) => {
      res.status(500).send({ error: err.message })
    })
})

router.post('/gft/twitter', function (req, res) {
  let usernames, tokenIds, contractAddress;
  try {
    ({ usernames, tokenIds, contractAddress } = req.body)
    assert(usernames.length == tokenIds.length)
    assert(contractAddress)
  } catch (err) {
    res.status(500).send({ error: err.message })
  }

  db.createTwitterGft(contractAddress, usernames, tokenIds).then((addresses) => {
    res.send({ addresses })
  })
    .catch((err) => {
      res.status(500).send({ error: err.message })
    })
})

router.post('/twitter/replies', function (req, res) {
  let conversationId;
  let length = 100;

  try {
    ({ conversationId, length } = req.body)

    request.get({
      url: `https://api.twitter.com/2/tweets/search/recent?query=conversation_id:${conversationId}&tweet.fields=in_reply_to_user_id,author_id,created_at,conversation_id&max_results=100`,
      headers: {
        'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
      }
    },
      function (err, r, body) {
        if (err) return res.send(500, { message: err.message })
        const tweets = JSON.parse(body).data.slice(0, length)
        res.send({ tweets })
      }
    )

  } catch (err) {
    res.status(500).send({ error: err.message })
  }
})

app.use('/api/v1', router)

app.listen(PORT, () => {
  console.log(`gft-art-api listening at http://localhost:${PORT}`)
})

