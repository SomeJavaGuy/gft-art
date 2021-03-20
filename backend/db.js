const levelup = require('levelup')
const s3leveldown = require('s3leveldown')
const AWS = require('aws-sdk')

const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY
})

module.exports = levelup(s3leveldown('my_bucket', s3))
