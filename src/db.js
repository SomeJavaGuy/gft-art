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
  USER_TWITTER: 'users/twitter/'
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

module.exports = {
  db,
  upsertTwitterUser
}
