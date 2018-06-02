const { Client: _pg } = require('pg')
const sample = require('lodash.samplesize')
const get_token = require('meli-auth')
const { get, post } = require('axios')
const parallel = require('../utils/parallel')
const price = require('../utils/price')
const R = require('ramda')

const dev = process.env.NODE_ENV !== 'production'

const host = 'https://api.mercadolibre.com'

const shipping = {
  "mode": "not_specified",
   "dimensions": null,
   "local_pick_up": false,
   "free_shipping": true,
   "logistic_type": "not_specified",
   "store_pick_up": false
}

const trim_title = title => {
  const words = title.split(' ')
  let acc = ""
  for (var i = 0; i < words.length; i++) {
    if (i === words.length - 1) return acc.concat(words[i]).trim().toLowerCase()
    else if (acc.concat(words[i]).length < 60) {
      acc += words[i] + ' '
    }
    else return acc.trim().toLowerCase()
  }
}

const predict_category = async (title, price) => {
  const titleEncoded = encodeURIComponent(title)

  const link = [
    `${host}/sites/MLM/category_predictor/predict`,
    `?title=${titleEncoded}&price=${price}`
  ].join('')

  let category
  category = await get(link)
  category = category.data.id

  return category
}

const run = async (token, pg, item) => {
  const posted_q = 'select * from posts where id = $1'
  let posted
  posted = await pg.query(posted_q, [item.id])
  posted = posted.rowCount > 0

  if (posted) {
    console.log('already posted')
    return
  }

  // title: opts.title,
  // description: { plain_text: opts.description },
  // price: opts.price,
  // available_quantity: opts.inventory,
  // category_id: opts.category,
  // pictures: [ { source: opts.image } ],
  // listing_type_id: opts.premium ? 'gold_pro': 'gold_special',
  // shipping: opts.me ? shipping_me : shipping,
  // currency_id: 'MXN',
  // condition: 'new',

  const title = trim_title(item.name)

  const category = await predict_category(title, item.price)

  const premium_args = {
    title: trim_title(item.name),
    description: {plain_text:item.description},
    available_quantity: 5, // syncronise later
    pictures: [{ source: item.image }],
    listing_type_id: 'gold_pro',
    shipping,
    currency_id: 'MXN',
    condition: 'new',
    price: price({
      price: parseFloat(item.price),
      shipping: 100,
      expectedProfit: 0.25,
      commision: 0.175,
      discount: 0,
      tax: 0.16,
      me: true,
      less_than_550: 0,
      more_than_550: 0,
    }),
    category_id: category,
  }

  const std_args = {
    title: trim_title(item.name),
    description: {plain_text:item.description},
    available_quantity: 5, // syncronise later
    pictures: [{ source: item.image }],
    listing_type_id: 'gold_special',
    shipping,
    currency_id: 'MXN',
    condition: 'new',
    price: price({
      price: parseFloat(item.price),
      shipping: 100,
      expectedProfit: 0.25,
      commision: 0.13,
      discount: 0,
      tax: 0.16,
      me: true,
      less_than_550: 0,
      more_than_550: 0,
    }),
    category_id: category,
  }
  
  await post(`${host}/items?access_token=${token}`, std_args)
}

(async () => {
  let token
  token = await get_token({}).promise()

  let account_id
  account_id = await get(`${host}/users/me?access_token=${token}`)
  account_id = account_id.data.id

  const pg = new _pg()
  await pg.connect()

  const create_q = `
    create table if not exists posts (
      id text,
      account text,
      title text,
      category text,
      inventory int,
      price numeric,
      premium boolean,
      status text,
      description text,
      item_id text
    )
  `
  await pg.query(create_q)

  const clear_q = 'delete from posts where account = $1'
  if (!dev) await pg.query(clear_q, [account_id])
  else console.log(clear_q, [account_id])

  let items
  items = await pg.query('select * from items')
  items = items.rows
  if (dev) items = sample(items)

  parallel(items.map(i => () => run(token, pg, i)), 1)
})()