require('dotenv').config()

const levelup = require('levelup')
const s3leveldown = require('s3leveldown')
const AWS = require('aws-sdk')
const ethWallet = require("ethereumjs-wallet").default

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

async function createTwitterGft(tokenAddress, usernames, tokenIds) {
  const batch = db.batch()

  const createdDate = datePath()
  const gftKey = makeKey(prefix.GFT_TWITTER, createdDate)
  const gftValue = {
    createdDate,
    tokenAddress,
    usernames,
    tokenIds
  }
  await batch.put(gftKey, gftValue)

  const userCache = {}

  for (let index = 0; index < usernames.length; index++) {
    const username = usernames[index]
    const tokenId = tokenIds[index]
    console.log(username, tokenId)
    const key = makeKey(prefix.GFT_TWITTER_RECIPIENTS, username)

    // handle repeated users
    let cache = userCache[key]
    if (!cache) {
      let gfts = []
      try {
        const result = await db.get(key, { asBuffer: false })
        if (result) gfts = JSON.parse(result).gfts
      } catch (err) {
        if (err.notFound) {
          // pass
        } else {
          throw err
        }
      }

      userCache[key] = { burner: ethWallet.generate(), prevGfts: gfts, username };
      cache = userCache[key]
    }

    gfts = [...cache.prevGfts, {
      createdDate,
      tokenId,
      tokenAddress,
      burnerAddress: cache.burner.getAddressString(),
      burnerKey: cache.burner.getPrivateKeyString()
      // tokenUrl and balance can be retrieved in frontend
    }]

    userCache[key].prevGfts = gfts

    const value = { gfts }
    await batch.put(key, JSON.stringify(value))
  }

  await batch.write()

  return Object.keys(userCache).map(k =>
    ({ username: userCache[k].username, address: userCache[k].burner.getAddressString() })
  )
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
