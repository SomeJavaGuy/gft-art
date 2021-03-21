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
origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  exposedHeaders: ['x-auth-token']
}
// enable all cors
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

router.get('/twitter/:tweetId', function (req, res) {
  const { tweetId } = req.params

  try {
    assert(tweetId)
  } catch (err) {
    if (err) return res.status(500).send({ message: err.message })
  }

  request.get({
    url: `https://api.twitter.com/2/tweets?ids=${tweetId}&tweet.fields=conversation_id,created_at`,
      headers: {
        'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
      }
  }, function (err, resp, body) {
    if (err) return res.status(500).send({ message: err.message })
    res.send(body)
  })
})

router.get('/twitter/:tweetId/replies', function (req, res) {
  const DURATION = 60 * 1000 * 60 // 1 hour
  const DELAY = 12 * 1000// 12 seconds

  const { tweetId } = req.params
  let { limit } = req.query

  try {
    assert(tweetId)
    assert(limit)
    limit = parseInt(limit, 10)
  } catch (err) {
    if (err) return res.status(500).send({ message: err.message })
  }

  let deadline;

  request.get({
    url: `https://api.twitter.com/2/tweets?ids=${tweetId}&tweet.fields=conversation_id,created_at`,
      headers: {
        'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
      }
  }, async function (err, resp, body) {
    if (err) return res.send(500, { message: err.message })
    console.log(body)
    const tweet = JSON.parse(body).data[0]
    const createdAt = new Date(tweet.created_at)
    deadline = createdAt.getTime() + DURATION
    deadline = Math.min(Date.now() - DELAY, deadline)
    deadline = new Date(deadline)

    console.log(deadline)

    const eligibleUsernames = new Set()

    let hardStop = 50
    let nextPageToken = await addUsernamesThatReplied(tweetId, deadline, eligibleUsernames)

    while(nextPageToken && (hardStop > 0)) {
      nextPageToken = await addUsernamesThatReplied(tweetId, deadline, eligibleUsernames, nextPageToken)
      hardStop -= 1
      console.log(nextPageToken, hardStop, eligibleUsernames.size)
    }

    const usernames = Array.from(eligibleUsernames)
    const earliestToLatest = usernames.reverse()

    res.send({ usernames: earliestToLatest.slice(0, limit) })
  })
})

async function addUsernamesThatReplied(tweetId, deadline, usernameSet, nextPageToken) {
  let url = `https://api.twitter.com/2/tweets/search/recent?query=conversation_id:${tweetId}&end_time=${deadline.toISOString()}&tweet.fields=id,in_reply_to_user_id,author_id,created_at&expansions=author_id`

  nextPageToken && (url += `&next_token=${nextPageToken}`)

  return new Promise((resolve, reject) => {
  request.get({
    url,
      headers: {
        'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
      }
    },
      function (err, resp, body) {
        if (err) reject(err)
        body = JSON.parse(body)
        if (body.errors) {
          console.error(body.errors)
          reject('Bad request')
        }
        const users = body.includes.users
        for (let index = 0; index < users.length; index++) {
          const user = users[index]
          usernameSet.add(user.username)
        }
        resolve(body.meta.next_token)
      }
    )
  })

}

app.use('/api/v1', router)

app.listen(PORT, () => {
  console.log(`gft-art-api listening at http://localhost:${PORT}`)
})

