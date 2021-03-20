require('dotenv').config()

const levelup = require('levelup')
const s3leveldown = require('s3leveldown')
const AWS = require('aws-sdk')

const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
})

const db = levelup(s3leveldown(process.env.AWS_S3_BUCKET_NAME, s3))

const prefix = {
  USER_TWITTER: 'users/twitter/',
  GFT_TWITTER: 'gft/twitter/',
  GFT_TWITTER_RECIPIENTS: 'gft/twitter/recipients/',
}

async function getTwitterRecipientGfts(username) {
  const key = makeKey(prefix.GFT_TWITTER_RECIPIENTS, username)
  const gfts = await db.get(key, { asBuffer: false })
  return JSON.parse(gfts)
}

async function createTwitterGft(usernames, tokenIds) {
  const batch = db.batch()

  const createdDate = datePath()
  const gftKey = makeKey(prefix.GFT_TWITTER, createdDate)
  const gftValue = {
    createdDate,
    usernames,
    tokenIds
  }
  await batch.put(gftKey, gftValue)

  for (let index = 0; index < usernames.length; index++) {
    const username = usernames[index]
    const tokenId = tokenIds[index]
    const key = makeKey(prefix.GFT_TWITTER_RECIPIENTS, username)

    let gfts = []

    try {
      const result = await db.get(key, { asBuffer: false })
      if (result) {
        gfts = JSON.parse(result).gfts
      }
    } catch (err) {
      if (err.notFound) {
        // pass
      } else {
        throw err
      }
    }

    // TODO: Add burner key pair and nft media
    gfts.push({
      createdDate,
      tokenId,
      // tokenAddress,
      // tokenUrl,
      // burner key pair
    })
    const value = {
      gfts
    }
    await batch.put(key, JSON.stringify(value))
  }

  await batch.write()
}

async function upsertTwitterUser(token, tokenSecret, profile) {
  const key = makeKey(prefix.USER_TWITTER, profile.id)
  const value = {
    token,
    tokenSecret,
    profile
  }
  await db.put(key, value)
  return value
}

function makeKey(prefix, uniqueKey) {
  return prefix + uniqueKey
}

function datePath() {
  const date = new Date()
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}/${date.getTime()}`
}

module.exports = {
  db,
  getTwitterRecipientGfts,
  createTwitterGft,
  upsertTwitterUser
}
